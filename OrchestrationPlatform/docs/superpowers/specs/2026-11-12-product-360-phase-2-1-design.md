# Product 360 Phase 2.1 Design

## Intent

Improve broad Product 360 answers and broad single-application overviews by
projecting compact, cited facts from the saved investigation rather than relying
on generic application semantics and category names. This is for users who need
an evidence-rich view of a product across applications or a detailed view of
one participating application, while retaining Lattice's existing evidence
boundaries and answer validation.

## Goals

- Give every participating application a balanced, investigation-specific
  digest in a broad Product 360 answer.
- Give a broad “everything from [application]” question an application-only
  evidence and answer path for any participating application.
- Include a small, deterministic set of meaningful facts, hierarchy-supported
  secondary entity names, same-application verified relationships, and their
  allowlisted citations.
- Replace redundant Product 360-only context projections to remain within the
  existing 24,000-character limit.
- Preserve the currently selected representatives, M1, E1, M2, focused intents,
  citation validation, persistence, rendering, and source-state caveats.

## Non-goals and anti-goals

- No changes to representative selection, ontology resolution, impact
  reasoning, source extraction, RAG, embeddings, persistence schema, or UI
  selection.
- No live provider requests, context-limit increase, commit, or push.
- Do not infer cross-application relationships from shared-subject participation.
- Do not infer operational consequences, completeness, causality, or
  conflicting values.
- Do not copy complete child-entity payloads into a model-facing projection.
- Do not use extraction order, record count alone, or generic retrieval scores
  as fact-selection criteria.
- Do not produce unsupported language such as “actively managed,” “plays a
  crucial role,” “essential,” or “comprehensive.”

## Current state and inspected evidence

The existing classifier routes broad Product 360 prompts to `product-360`.
“Tell me everything coming from Configit for this product” currently falls
through to generic `summary`. The Product 360 prompt contains only a manifest,
static primer, selected relationship summaries, evidence boundary, and compact
question evidence. `ensureEngineeringAnswerCoverage` builds application
coverage for `product-360`, while its generic path can append global
`Applications Present` and primary-entity sections to application-scoped
questions.

For the saved Steering snapshot, the exact broad question
“Tell me everything known about this product across all participating
applications.” currently serializes to 23,707 characters for the context
packet and 9,680 characters for the model-facing prompt projection. The prior
reported packet figure of 23,498 differs by 209 characters and should be
treated as a historical measurement; implementation tests must measure from
the current builder and use the exact question above.

Current relevant packet/prompt field sizes, measured from that saved snapshot:

| Projection | Serialized characters |
|---|---:|
| Full `CopilotContextPacket` | 23,707 |
| `engineeringBrief` | 7,182 |
| `engineeringBrief.subjectApplicationParticipation` | 3,284 |
| `engineeringBrief.primaryEntities` | 701 |
| `engineeringBrief.majorRelationships` | 1,028 |
| Selected `entities` | 4,660 |
| `entityCandidates` | 3,075 |
| `citations` | 1,563 |
| Product 360 prompt pre-context | 4,267 |
| Product 360 prompt `questionSpecificEvidence` | 5,264 |
| Full model-facing prompt projection | 9,680 |

The Product 360 packet currently selects five entities (four representatives
and the Codebeamer tracker) and one relationship. The prompt's entity projection
omits entity properties, so the model does not receive most application facts.
The packet's large Product 360-only fields overlap: the manifest/participation
representatives duplicate `primaryEntities` and selected representative
entities; `applicationsPresent` and subject summaries repeat the manifest
application list; generic brief relationship fields repeat the verified
relationship projection; and empty generic result collections add schema
overhead without evidence. The Product 360-only projection may replace these
redundant structures after required digest facts, citation IDs, source
boundaries, and selected relationships are preserved. The shared citation
allowlist and fields consumed by answer validation must not be removed.
M1/E1/M2 packet composition and prompt projections must not be changed.

The saved investigation contains the following evidence useful for compact
digests:

- **Codebeamer:** 17 entities, including the selected Steering System
  Requirements record, requirement-detail groups/fields, a project and tracker;
  15 canonical relationships (14 `contains`, one `manages`). The selected
  relationships include the tracker-to-requirement `manages` edge. Source
  status is partial, with item, relation, and attachment retrieval failures.
- **Windchill:** 17 entities, including the selected part occurrence,
  physical attributes, product context, requirement/document records, change
  tasks, and a change notice. The selected part has supported values for weight,
  dimensions, material composition, revision, state, view, and source. Source
  status is available.
- **SAP:** 114 entities, including the selected material, product details,
  stock metrics, material movements, accounting documents/lines, history
  metrics, and SAP field records. Source status is partial and stale. Facts
  must describe record categories/values only and must not infer procurement,
  inventory, production, cost, or other consequences.
- **Configit:** 41 entities, including the selected Steering work-item subject,
  seven product details, three families (Market/MRKT, Drive Orientation, and
  Steering Type), eight features, three rules, rule fields, and localization
  records. The work-item status is `InProgress`. Market/MRKT is secondary.
  Selected governed hierarchy links the subject to details/families and
  families to features; rules and localization remain internal Configit
  evidence.

The Product 360 context packet and answer coverage already share the
application-balanced `SubjectApplicationParticipationBrief` records and
selected relationship evidence. The implementation should extend this
Product-360-only data path with bounded digest facts so the same projection is
available to prompt construction and deterministic answer coverage. Each fact
or secondary entity must keep the actual selected source entity/relationship
citation ID, and every such citation must be present in the existing packet
allowlist.

## Approaches

1. **Append full application evidence to the current Product 360 packet.**
   This is straightforward, but the current packet has only 293 characters of
   headroom for the exact broad question and would exceed its limit. Rejected.
2. **Change only answer coverage and depend on the existing generic summary
   evidence.** This could suppress the four-app section for a focused question,
   but current Product 360 selection has only four representatives plus one
   tracker and no useful Configit hierarchy in its model-facing entity list.
   It does not solve evidence-rich answers. Rejected as incomplete.
3. **Use a Product-360-only replacement projection plus a narrow
   `application-overview` intent.** Build bounded application digests from
   selected persisted evidence; preserve the existing representative records;
   replace duplicated generic Product 360 summaries; route broad
   “everything from [application]” prompts to an application-scoped projection
   and suppress global answer coverage only for that intent. This is the
   selected approach because it solves both answer-quality failures without
   changing unrelated intent paths or raising the context limit.

## Design

### Application digest contract and evidence selection

Add a typed digest representation to the Product 360 context, containing the
application, its existing representative, up to 3–6 compact facts, bounded
named secondary entities, selected same-application verified relationships,
source-state warning, and supporting citation IDs. The facts are projections,
not new evidence records; keep entity/relationship IDs and citation IDs that
resolve through the existing context allowlist.

Build digests from the actual canonical records and already-selected governed
edges available to the investigation. Do not select child facts by list order or
record count alone. Use a deterministic ordering that prefers:

1. the selected representative and its authoritative source role;
2. governed hierarchy adjacent to that representative;
3. verified same-application relationships;
4. meaningful product attributes;
5. stable entity ID for tie-breaking.

Limit every fact and label to a compact projection of selected properties.
Avoid raw source payloads, duplicate normalized/qualified property aliases,
execution diagnostics not needed to explain a source caveat, and complete child
entity property dictionaries. Do not make a category or hierarchy edge imply
cross-application connectivity or operational causality.

The fact limit is a maximum, not a quota: include fewer than three facts when
the selected evidence cannot support more distinct, citable facts. Do not
repeat facts or fill a digest with generic application semantics to meet a
count. The selected representative and source-state boundary remain available
even when there are no additional supported facts.

Use the existing participation representative unchanged, including its
application, entity ID, label, semantic role, native ID, and citation. Configit
work-item subject remains its representative; Market/MRKT remains a secondary
family. Use actual source and relationship citations for secondary facts and
fail explicitly if a selected digest fact cannot be cited through the existing
allowlist.

### Product 360 context projection and budget

For `product-360` only, replace duplicated generic fields with the compact
digests and necessary shared validation data. The replacement must not affect
M1, E1, M2, or other focused intent packets. Keep the existing 24,000-character
limit and compaction behavior, with this preservation order:

1. subject identity;
2. one existing representative per participating application;
3. representative citations;
4. application-specific facts and supporting citations;
5. evidence boundary and source state;
6. selected verified relationships;
7. named secondary entities;
8. lower-value category labels and counts.

Measure the exact serialized Product 360 packet and prompt payload from the
saved Steering snapshot. Report initial current-tree baseline, removed or
replaced projection sizes, per-application digest sizes, final packet size,
final prompt size, and remaining headroom. Assert both serialized context
objects remain at or below 24,000 characters, and the digest is compact enough
to preserve all required citations and boundaries.

### Application-overview routing and answer isolation

Add `application-overview` to the existing intent union and classifier for broad
“everything from [application]” requests that identify a participating
application. Recognize such requests only after existing focused checks for
relationship, impact, dependency, root-cause, risk, change, evidence, document,
requirement, material, and family questions. Product 360 remains a distinct
all-application intent. A focused question that does not request a broad
application overview must keep its current intent and evidence selection.

**Builder call:** Recognize only application names in the shared application
semantics mapping. If a recognized application is not present in the current
investigation, keep the request application-scoped and state that no evidence
for it is present; do not fall back to a four-application answer. Do not treat
family names such as MRKT as application names, so family-focused questions
remain on their existing paths.

For `application-overview`, carry the selected application scope explicitly in
the compact context projection. Include only:

1. short investigation-subject orientation;
2. that application's existing representative;
3. that application's selected digest facts;
4. internal selected relationships and their citations;
5. its source-state/evidence-boundary information;
6. its available drill-down categories.

Do not include all-application primary entities, `Applications Present`,
unrelated relationships, or generic four-application coverage sections.
Update `ensureEngineeringAnswerCoverage` for the new intent only; preserve the
existing E1 `summary` output and the M1/M2 behavior.

### Wording and formatting

Use precise, sourced statements. Avoid unsupported activity/importance claims,
the term “comprehensive” with partial coverage, and statements of conflict
unless selected evidence contains the exact conflicting values. Render the
representative once, use the semantic role from the selected participation
record rather than `source-representation` when available, and render each
relationship predicate once. Do not append a trailing investigation subject
label to a source entity label.

### Validation and persistence

Continue using the existing answer schema, citation allowlist validation,
`ensureEngineeringAnswerCoverage`, persistence, and renderer pass-through.
Only mocked provider and persistence tests are allowed. Do not add UI-side
selection, a second validation path, or a new persistence format.

## Implementation areas

- `frontend/features/lattice-next/copilot/contracts.ts`: typed digest and
  application-overview intent/scope contracts.
- `frontend/features/lattice-next/copilot/context-builder.ts`: deterministic
  cited digest construction, Product-360-only projection replacement,
  application-overview scoping, budget compaction, and answer coverage
  conditions.
- `frontend/features/lattice-next/copilot/execute-copilot-turn.ts`:
  application-overview-only answer guidance while retaining the existing
  provider validation and persistence pipeline.
- `frontend/features/lattice-next/copilot/tests/context-builder.test.ts`:
  per-application facts/citations, no copied child payloads, projection
  replacement, and exact context/prompt budget tests.
- `frontend/features/lattice-next/copilot/tests/document-intent.test.ts`:
  broad application-overview positives and focused-intent precedence.
- `frontend/features/lattice-next/copilot/tests/current-investigation-traceability.test.ts`:
  Steering digest expectations derived from the saved fixture and unchanged
  M1/E1/M2 behavior.
- `frontend/features/lattice-next/copilot/tests/execute-copilot-turn.test.ts`:
  mocked persistence for broad Product 360 and application-only answers,
  allowlisted citations, and unsupported-claim exclusions.
- `frontend/features/lattice-next/workspace/tests/copilot-answer-content.test.tsx`:
  renderer pass-through only if persisted formatting changes.

## Required regressions

- Broad Product 360 includes a meaningful, cited digest for all four
  applications, retains each existing representative, and includes only
  selected verified relationships.
- Configit includes the work-item subject/status, named families, and
  hierarchy-supported features where selected and citable; Market/MRKT never
  replaces the representative.
- A focused broad Configit overview contains only Configit evidence and does
  not append all-application primary entities or coverage. Parameterize
  equivalent isolation tests for Codebeamer, Windchill, and SAP.
- E1 still has its existing four-application Primary entities section; M1 and
  M2 answer and citation behavior are unchanged.
- Every secondary fact retains its source citation, which passes the existing
  citation validator; missing citations fail explicitly.
- No unsupported management, importance, impact, causality, or conflict claims;
  no duplicate representative labels or relationship predicates.
- Digest projections do not contain complete child entity property payloads.
- The final serialized Product 360 packet and prompt remain within 24,000
  characters, with required facts, citations, boundaries, and relationships
  retained through compaction.

## Validation scope

Use mocked provider/persistence behavior only. Run only:

1. focused Product 360 context-builder tests;
2. current-investigation traceability tests;
3. focused application-answer tests;
4. mocked executor/persistence tests;
5. renderer pass-through tests if persisted formatting changes;
6. changed-file ESLint;
7. `git diff --check`.

Do not make a live provider request, implement RAG, change the context limit, or
commit/push.

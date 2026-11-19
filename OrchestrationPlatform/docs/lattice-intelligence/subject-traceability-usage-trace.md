# Subject-Traceability Usage Trace

## Result

The current investigation graph contains subject-traceability edges, and M1
passes the investigation-scope gate. The live M1 retrieval initially selects
57 subject-traceability edges. There are two downstream losses:

1. The reasoning package receives those edges but does not preserve them as
   relationship records or create narratives for them. This is the first
   downstream stage where the edges stop being explicit reasoning artifacts.
2. Context-budget compaction later removes all subject edges from the final
   `packet.relationships` list. The bounded brief and prompt then receive none.

The engineering brief has an independent ranking gap: its pre-budget top-five
relationships are all canonical. Graph materialization and M1 intent routing
are not the cause.

## Investigation and evidence method

- Active investigation shown in the local Lattice UI: `Steering`
- Investigation ID: `lattice-6513b6b1-ff8f-40db-a9f3-346bbe8cdb38`
- Snapshot and canonical revision: `1`
- Inspection date: 2026-11-05
- Read-only evidence: current investigation GET endpoint and direct execution
  of the workspace context-builder against its returned snapshot.
- No Copilot provider request was sent and no application code was changed.
  The only file created for this task is this report.

The API returned the current saved graph with `derivedOnRead: false`. Its graph
revision matches the snapshot revision, and the subject-edge array is present.
The API response therefore does not indicate a stale graph that needed
rebuilding on read.

| Current graph fact | Observed value |
|---|---:|
| Canonical entities | 148 |
| Subject-traceability relationships | **148** |
| Subject-traceability edge sources | Codebeamer 17, SAP 114, Windchill 17 |
| Configit entities / subject edges | 0 / 0 |
| Canonical relationships | 122 |
| Ontology-resolved relationships | 0 |
| Relationship paths | 295 |
| Impact paths / chains | 0 / 0 |

Each of the 148 subject edges is present in
`knowledgeGraph.subjectTraceabilityRelationships`, has type
`represents-subject`, targets the investigation subject node, and is marked
`impactEligible: false`. These are subject-membership edges, not direct
application-to-application relationships. The current snapshot has three
source applications, so it cannot support a four-application answer that
includes Configit.

## M1 stage trace

Question:

> Which applications are involved in this investigation and how are they connected?

### 1. Intent and retrieval candidates

M1 is classified as `relationship` and as investigation-scoped. The
`includeSubjectTraceability` gate is therefore true. The raw relationship
candidate set contains 270 items:

| Candidate category | Count |
|---|---:|
| Canonical | 122 |
| Subject traceability | 148 |
| **Total** | **270** |

At the default per-category limit of 60, the first composed retrieval packet
selects 60 relationships: 3 canonical and **57 subject-traceability** edges.
Those candidates require 59 distinct endpoint entities. Thus subject edges
are in both the raw candidate set and the initial M1 retrieval selection.

### 2. Context-budget compaction — first edge-object loss

The default M1 context limit is 24,000 characters. The compaction trace records
the relationship count changing from 270 available relationships to 1 in the
returned packet:

| Budget trace | Entities | Relationships | Evidence | Paths | Relationship narratives |
|---|---:|---:|---:|---:|---:|
| Before compaction | 149 | 270 | 3 | 60 | 12 |
| Returned M1 packet | 2 | 1 | 1 | 0 | 1 |

The returned packet is 13,695 serialized characters and contains **zero**
subject-traceability relationships. It contains only this protected canonical
relationship:

`rel:codebeamer:tracker:9734:manages:codebeamer:primary-codebeamer:item:1187`

The compaction trace reports 269 omitted relationships and identifies that
canonical relationship as `protectedRelationshipId`. Subject edges carry no
source-evidence IDs; the context builder's protection predicate requires a
complete endpoint-and-evidence group. Consequently, the subject edges do not
receive the relationship-preservation minimum. The greedy trim order reduces
the relationship count before it trims several other categories.

### 3. Reasoning package

The reasoning-package builder receives all 270 normalized relationship
contexts before packet compaction. It does **not** expose a `relationships`
array in its output. Its relationship narratives are generated from scored
`relationshipPaths`; subject edges are not path edges, so none of the 12
pre-budget narratives references a subject edge.

The subject edges can affect intermediate entity-importance calculations
because the builder iterates its input relationships. That is not equivalent
to retaining the subject edges as reasoning artifacts or producing
subject-traceability narratives.

There is an additional summary mismatch: before compaction, the reasoning
summary says “no cross-application relationship was retrieved.” Its
cross-application counter requires both endpoints to have source-application
values. A subject node has no source application, so a valid participant-to-
subject edge is not counted as a cross-application link.

### 4. Engineering brief

Before compaction, the engineering brief's five `majorRelationships` are all
canonical; **0 of 5** are subject-traceability. Its five relationship
narratives also contain **0** subject-edge references. The brief therefore
does not promote subject edges into a narrative, even before the final
context-budget boundary.

The bounded brief returned in the actual context packet is further restricted
to that packet's relationships and reasoning narratives: one canonical
relationship and zero subject-traceability relationships or narratives.

### 5. Prompt payload

The M1 prompt payload contains:

| Prompt field | Subject-traceability count |
|---|---:|
| `engineeringBrief.majorRelationships` | **0** |
| `engineeringBrief.relationshipNarratives` | **0** |
| `supportingContext.relationships` | **0** |

The prompt builder forwards the bounded engineering brief and the remaining
supporting context. It does not remove a subject edge at this stage; there are
no such edges in the bounded packet it receives. The final prompt has one
major relationship, the canonical Codebeamer `manages` relationship.

The saved M1 answer currently visible in the investigation conversation is
consistent with this payload: it describes Codebeamer's tracker-to-requirement
relationship and does not explain that records from multiple systems
participate in the Steering subject. That saved answer is corroborating UI
evidence; the stage counts above come from the read-only run against the
current snapshot.

## Findings by requested cause

| Cause | Finding | Evidence |
|---|---|---|
| **A. Investigation not rebuilt** | **Not the cause.** The current revision-1 graph already has 148 subject edges, and `derivedOnRead` is false. | Current API snapshot and graph revision. |
| **B. Relationship retrieval** | **Final packet edge-object loss.** M1 initially selects 57 subject edges, then compaction removes all of them and returns zero. This occurs after the reasoning package is built. | Default context-builder run: 270 available → 1 returned; 269 omitted. |
| **C. Reasoning package** | **First downstream representation gap.** The package consumes relationship contexts for intermediate scoring but has no raw relationship collection; narratives come from ontology paths and none reference subject edges. The cross-system summary also does not count participant-to-subject edges. | Pre-budget reasoning instrumentation: 270 input relationships, no output relationship array, 0 subject narratives. |
| **D. Engineering brief** | **Additional ranking gap.** Its pre-budget top five are all canonical, with no subject-edge narratives; the bounded brief then mirrors the already compacted packet. | Pre-budget brief: 0/5 subject relationships; final brief: 0. |
| **E. Prompt construction / investigation content** | **Prompt construction is not the first loss.** It forwards zero subject edges because the bounded context contains none. Separately, the current investigation has no Configit records, so the four-application benchmark expectation does not match this snapshot. | Final prompt counts all zero; live edge source counts include only Codebeamer, SAP, and Windchill. |

## Conclusion

For this live M1, the graph is populated and the intent gate works. The first
downstream representation gap is the reasoning package: it consumes the
subject edges but does not preserve them as relationship records or narratives.
The engineering brief independently ranks them out. Later, context-budget
compaction removes all of them from the final retrieval packet, leaving the
prompt with none. The current live snapshot also differs from the
four-application M1 expectation because Configit is absent.

## Code-path references

- Graph materialization and relationship count:
  [ontology-evaluator.ts](../../frontend/features/lattice-next/plm-brain/universal/ontology-evaluator.ts#L445)
- Cached-graph validity check for the subject-edge collection:
  [ensure-investigation-knowledge-graph.ts](../../frontend/features/lattice-next/plm-brain/universal/ensure-investigation-knowledge-graph.ts#L24)
- Investigation-scope gate and subject-edge context mapping:
  [context-builder.ts](../../frontend/features/lattice-next/copilot/context-builder.ts#L216)
- Relationship contexts and reasoning-package input:
  [context-builder.ts](../../frontend/features/lattice-next/copilot/context-builder.ts#L1742)
- Path-derived narratives and cross-application summary:
  [context-builder.ts](../../frontend/features/lattice-next/copilot/context-builder.ts#L956)
- Engineering brief ranking:
  [context-builder.ts](../../frontend/features/lattice-next/copilot/context-builder.ts#L1257)
- Protected relationship selection, trim order, and bounded brief:
  [context-builder.ts](../../frontend/features/lattice-next/copilot/context-builder.ts#L1964)
- Prompt payload construction:
  [context-builder.ts](../../frontend/features/lattice-next/copilot/context-builder.ts#L1472)

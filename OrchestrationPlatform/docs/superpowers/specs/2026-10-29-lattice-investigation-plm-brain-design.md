# Lattice Investigation PLM Brain and Retrieval Upgrade

**Status:** Proposed design — approval required before implementation  
**Date:** 2026-10-29

## Intent

Make each Lattice investigation a portable, auditable representation of its
governed PLM Brain. Use the existing immutable investigation snapshot and its
source entities, relationships, unresolved evaluations, findings, and evidence
to produce a version-pinned knowledge graph that supports Copilot answers and
Download JSON equally. Improve answer depth by identifying the question's
strongest entity match, expanding through evidenced relationships and evidence
chains, traversing impact paths, and exposing uncertainty instead of inventing
links or failing generically.

The investigation snapshot remains the complete evidence boundary. Copilot
question answering must not call Windchill, SAP, Configit, Teamcenter, or
Codebeamer.

## Goals

- Make `OrchestrationPlatform/docs/relationships.md` the single authoritative
  source for machine-readable relationship definitions and their human
  explanation.
- Replace duplicate hardcoded relationship catalogs and per-rule mappings with
  a versioned ontology embedded in `relationships.md` and a generic evaluator.
- Enrich every newly published investigation revision with a deterministic,
  ontology-versioned PLM Brain package derived only from that revision.
- Include resolved relationships, unresolved candidates, evidence chains,
  citations, bounded paths, impact paths, traversal indexes, cross-application
  mappings, provenance, status/strength, and confidence metadata in the
  canonical package and Download JSON.
- Use one shared enriched package for Copilot context and Download JSON.
- Retrieve question-relevant entities and direct/multi-hop graph evidence from
  the active investigation only; rank evidence and preserve relationship
  direction and inverse traversal semantics.
- Continue with the highest-confidence entity when useful and disclose
  near-tied candidates. Use deterministic clarification when the strongest
  candidate is below the low-confidence threshold.
- Ground generated answers in retrieved evidence and paths, with evidence,
  relationships, analysis, and conclusion made explicit.
- Produce a useful uncertainty/fallback answer when the snapshot has partial,
  missing, unresolved, or truncated evidence.

## Non-goals

- No live source-system retrieval during Copilot question answering.
- No source-system write-back or automatic relationship promotion based on AI
  suggestions, names, descriptions, or co-occurrence.
- No UI restyling or new UI surface.
- No external ontology service, third-party graph database, model fine-tuning, or
  new dependency for parsing the ontology.
- No claim that an ontology template by itself proves an instance relationship
  or a causal impact.

## Constraints and invariants

- The raw source and canonical evidence for an investigation revision remain
  immutable and authoritative. Derived PLM Brain data is a separately
  identifiable, deterministic projection pinned to that revision and ontology
  version.
- A resolved relationship requires a declared ontology evidence rule satisfied
  by evidence in the active investigation. Similar names or shared
  investigation membership are never sufficient.
- Preserve source-native identity, provenance, capture time, source status,
  freshness, evidence references, and canonical relationship direction.
- A reverse traversal uses the ontology's inverse meaning and label while
  retaining the single canonical edge and its original status, strength,
  provenance, and evidence.
- `POTENTIAL`/impact paths are not proof of causation or a completed source
  transaction. Never promote them without their defined evidence condition.
- Every answer fact and recommendation is supported by citation IDs from the
  active investigation package and its exact snapshot revision.
- Keep deterministic ordering, cycle protection, and configured traversal
  bounds. Report omissions rather than treating truncated evidence as absent.
- Ranking defaults are resolver configuration, not ontology data:
  - exact governed identifier: highest priority, default score `1.00`;
  - exact governed ontology-property match: next priority, default score `0.85`;
  - resolved relationship-path evidence: next priority;
  - lexical similarity: fallback only, never sufficient to establish a
    relationship or accept a factual answer by itself;
  - low-confidence cutoff: `0.55`;
  - ambiguity notice when the highest candidate scores are within `0.10`.
  Scores are deterministic ranking signals, not calibrated probabilities.
- Do not run tests, builds, review, or validation. Implementation should be
  limited to code/document changes and source inspection; do not invoke shell
  commands that could contact the sandbox local proxy.

## Approaches considered

### A. Versioned declarative ontology in `relationships.md` plus generic evaluator — selected

Add a fenced, machine-readable JSON ontology section to the authoritative
relationship Bible. Parse and validate the section at the server boundary, then
evaluate its entity constraints, directions, inverse traversals, evidence
rules, status/strength semantics, and impact-path templates using one generic
engine. Pin the resulting reasoning package to each published investigation
revision. Copilot and Download JSON consume that same artifact.

This removes duplicate rule catalogs, keeps documentation and runtime
definitions together, avoids relationship-specific code, and supports
reproducible offline question answering.

### B. Parse the existing prose at runtime

This avoids structured definitions but cannot reliably recover typed evidence
paths, operators, valid kinds, status defaults, or traversal limits from prose.
Wording edits would silently alter behavior or leave the runtime incomplete.
Rejected.

### C. Keep typed TypeScript rules and resolver functions

This is executable but leaves a second source of truth and requires code edits
for every ontology relationship. It conflicts with the explicit requirement
that relationship mappings be ontology-driven rather than hardcoded. Rejected.

### Enrichment lifecycle

Pin the enriched PLM Brain package into each new canonical investigation
revision. An explicit refresh creates a new revision and regenerates the
package. Existing legacy snapshots without a pinned package may be enriched
deterministically from their stored canonical evidence using the current
ontology, but must be marked with the ontology version used; their source
evidence is never modified. The exact migration/pinning behavior for legacy
snapshots is a builder decision and must not silently claim old answers were
generated from a version that was not stored.

## Architecture

### 1. Machine-readable ontology

`relationships.md` retains explanatory sections and gains one fenced block
identified as the Lattice relationship ontology. The block contains a schema
version and ontology version plus declarative definitions. Definitions describe:

- application identifiers and entity-kind aliases/valid pairings;
- relationship ID/type, forward meaning and direction;
- inverse traversal type/label and endpoint reversal;
- interpretation and impact semantics, including non-causation limits;
- default status and strength where a rule is satisfied;
- evidence expectations and allowed source/target property paths;
- deterministic match operators (initially exact scalar or exact list
  reference; no fuzzy/name-only resolver);
- the evidence status and provenance needed to resolve a relationship;
- whether the relationship participates in impact traversal and its bounded
  traversal semantics;
- relationship-path templates whose steps refer to ontology relationship IDs.

Parsing fails explicitly for an invalid schema, duplicate definition ID,
unknown relationship reference, invalid direction, unsupported operator, or
empty ontology. Human prose remains explanatory; the JSON block is the
machine-executable portion of the same authoritative file.

### 2. Generic ontology evaluation and immutable package

At canonical publication, after source evidence is assembled and validated,
the server parses the ontology and evaluates every definition against
investigation entities and existing canonical relationships. A generic matcher
uses only declared application, entity-kind, and property-path constraints.

For each rule:

- Satisfied evidence yields a stable resolved relationship instance with
  source/target entity IDs, forward and inverse semantics, ontology version,
  rule/evidence IDs, status, strength, provenance, capture/freshness, and
  citations.
- Missing, ambiguous, or incompatible evidence yields an unresolved evaluation
  with candidate IDs, candidate counts/truncation, reason, and evidence gap;
  it does not yield a confirmed edge.
- Existing source/canonical edges remain represented as source facts and are
  semantically enriched only when an ontology definition applies. Do not
  overwrite source evidence or conflate a derived template match with a
  source-explicit edge.
- Impact paths are deterministic traversals of eligible resolved edges and
  declared path templates. A path retains each edge and evidence citation;
  path meaning remains potential unless the ontology and evidence establish a
  stronger status.

The revision-pinned `knowledgeGraph` package contains:

- `schemaVersion`, `ontologyVersion`, and canonical investigation/revision IDs;
- the exact ontology definitions/version needed to interpret the package;
- primary and connected entities with source identity and provenance;
- canonical and ontology-resolved relationships, with forward/inverse
  semantics, status, strength, provenance, and citations;
- relationship evidence, findings, and unresolved relationship evaluations;
- bounded relationship paths and impact paths;
- cross-application mappings and deterministic traversal indexes;
- confidence/coverage metadata, partial/stale state, and truncation/omission
  counts.

This object is derived at publication and immutable for that revision.
Refresh creates a new package. Legacy packages are explicitly marked as
derived during read/export and include the ontology version used.

### 3. Question-time retrieval and ambiguity

Question answering loads only the requested investigation snapshot and its
pinned knowledge graph. It does not invoke source adapters or discovery APIs.

Entity identification scores all matching snapshot entities deterministically:

1. exact governed native/canonical identifier;
2. exact ontology-declared property identifier;
3. entities supported by resolved relationship-path evidence;
4. lexical similarity as a fallback signal.

When multiple candidates exist, continue with the strongest candidate if the
score is at least `0.55`; when the leading candidates are within `0.10`, include
the alternatives and an explicit ambiguity notice in the answer. Below `0.55`,
do not make a substantive entity-specific claim: return a grounded clarification
answer that lists candidate entities, their available evidence, why confidence
is low, and asks the engineer which entity they intended.

Question classification (summary, relationship, impact, dependency, root
cause, evidence, risk, change analysis) selects retrieval depth and evidence
group priorities. Broad summary questions may use the investigation subject and
whole-graph summary; entity questions use selected candidate(s). Explicit
impact/dependency questions prefer directed impact-enabled paths. Ambiguous
direction uses valid forward and inverse traversals without changing canonical
edge orientation.

Traversal has a configured maximum depth (initial default 3), visited entity
and relationship sets, deterministic tie-breaking, and a per-category/context
budget. Evidence is collected from all traversed endpoints, edge evidence,
findings, unresolved candidates, source state, and citations. Evidence groups
are direct, relationship, dependency, and impact evidence; rank governed
identifier/property matches and path evidence before lexical matches, with
stable ID tie-breaks.

The reasoning-friendly model context contains primary entity/candidate
metadata, connected entities, named relationship semantics, paths, supporting
evidence, potential impacts, unresolved candidates, source freshness,
confidence, and disclosed omissions. The LLM consumes this graph; it does not
discover or manufacture known relationships.

### 4. Grounded generation and graceful degradation

The model answer is directed to present:

1. Evidence
2. Relationships / path
3. Analysis
4. Conclusion

Facts and recommendations retain validated citations. The active revision,
ontology version, selected entities, confidence, and retrieval coverage are
carried in answer context/metadata. Low-confidence entity selection is handled
deterministically as a clarification response rather than asking the model to
choose an unsupported entity. When evidence is partial, unresolved, missing,
or truncated, the model/fallback states what was found, what is missing, what
the retrieval could not establish, and a useful next investigation question.

Provider/configuration/network/validation failures remain explicit operational
errors. They must not be disguised as evidence-based success answers. Offline
retrieval gaps use graceful grounded fallback; they are distinct from transport
failures.

### 5. Portable Download JSON

The existing hierarchical export remains backward-compatible for its
presentation fields and adds the revision-pinned `knowledgeGraph` package,
ontology version, resolved relationships, paths, impact paths, relationship
evidence, cross-application mappings, traversal indexes, and confidence/
coverage metadata. It must export the same package used by Copilot, not
recompute an alternate relationship interpretation from projected UI graph
labels.

## Scope and likely components

Implementation is limited to the Lattice application and the existing
`relationships.md`:

- `docs/relationships.md` — embedded versioned ontology definitions and
  synchronized prose.
- `frontend/features/lattice-next/contracts/intelligence-v1.ts` and related
  PLM Brain contracts — versioned enriched package types.
- `frontend/features/lattice-next/plm-brain/universal/**` — replace the
  hardcoded universal-rule catalog and per-rule matchers with a parser,
  schema validation, generic ontology evaluator, stable derived IDs, and
  bounded path/index generation.
- `frontend/features/lattice-next/infrastructure/merge-source-intelligence.ts`
  and/or canonical assembly/publication path — run enrichment before publishing
  the revision-pinned canonical package.
- Investigation API/kernel contracts and reducer only where needed to persist
  derived package within the same canonical publication event.
- `frontend/features/lattice-next/copilot/context-builder.ts`,
  `contracts.ts`, `execute-copilot-turn.ts`, `answer-validator.ts`, and
  `policy.ts` — entity scoring, snapshot-only traversal, reasoning context,
  ambiguity notice/clarification, confidence and grounded output.
- `frontend/features/lattice-next/export/hierarchical-json-export.ts` plus the
  current caller — include the shared pinned knowledge graph package in the
  downloaded JSON.
- Focused offline tests/fixtures are ordinarily expected for ontology parsing,
  relationship evaluation, bounded traversal, confidence/ambiguity, Copilot
  grounding, and export parity. They are intentionally omitted during this
  implementation because the user explicitly prohibited tests, builds, review,
  and validation.

No source-system adapter is to be called from the question-answering path.
Existing source calls that create or explicitly refresh an investigation remain
in their current workflow, before the immutable snapshot is published.

## Success criteria

- `relationships.md` is the only relationship mapping/evidence-rule authority;
  runtime does not retain duplicate per-relationship catalogs or hardcoded
  application-specific resolution cases.
- Every published new revision has a deterministic package pinned to the
  revision and ontology version.
- The package and Download JSON expose governed relationship instances and
  supported multi-hop/impact paths with sufficient provenance/evidence to be
  consumed offline by another LLM.
- Copilot receives the same graph package and retrieves only from the active
  snapshot.
- Exact governed IDs and property evidence outrank path and lexical matches;
  lexical similarity never independently establishes a factual relationship.
- Ambiguity is surfaced, low-confidence entities trigger a useful clarification,
  and absent/partial paths are disclosed rather than converted to “no impact.”
- Generated facts/recommendations cite active-revision evidence and distinguish
  potential impact from causation.

## Decisions left to the builder

- Select an embedded JSON fence marker and validate it with existing TypeScript
  types and explicit runtime guards; do not add a dependency.
- Choose stable IDs, path ordering, and per-category budgets that preserve
  existing citation-ID conventions.
- Map only relationship instances supported by the ontology evidence rules and
  persisted snapshot data. Where the current prose lacks a concrete property
  path/evidence rule, represent the ontology pattern as unresolved/not
  resolvable until the rule is explicitly defined; do not guess a mapping.
- Preserve legacy snapshot reads. Clearly mark any package derived from a
  legacy revision that did not persist its original ontology package.

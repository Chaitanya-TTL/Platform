# Lattice Engineering Consequence Awareness

**Status:** Approved for implementation planning
**Date:** 2026-10-27

## Intent

Prove that Lattice can help an engineer make a better decision by using
connected enterprise data and the existing cross-application relationship
model to surface a meaningful realization. The core product work is to give the
model the right relationship-aware context and prompt so it can explain why a
seemingly local change is not local.

The first proving ground is **cross-system impact**, expressed as consequence
awareness rather than as an impact-analysis workspace. The user's intended
realization is: “I thought this change was isolated. It isn't.”

## Product thesis

An engineering insight is a non-obvious realization that changes what a user
understands, decides, or does. Relationships, paths, records, graphs, evidence,
and recommendations are mechanisms that may support an insight; none is the
product outcome by itself.

The [relationship model](../../relationships.md) is the authoritative reference
for how supported entities, attributes, and cross-system relationships connect.
The model should use that semantic foundation together with the active
investigation's actual connected data. The experience should meet the user in
the context of engineering work, answer in plain language, preserve one
evolving inquiry, and let curiosity reveal supporting detail. It should not ask
users to decode a graph or an investigation report before they understand why
they should care.

## Goals

- Identify meaningful downstream consequences in connected enterprise data.
- Explain the consequence in plain language, including why the change is not
  local and what engineering function or review it affects.
- Give a user a direct answer in their engineering context, with deeper
  explanation and supporting evidence available when curiosity calls for it.
- Assemble model input around the user's question, the relevant relationship
  definitions, and the strongest connected paths and attributes—not just
  lexical matches to record names.
- Shape answers around consequence and decision usefulness, with enough
  explanation to make the insight understandable rather than an arbitrary
  sentence or claim count.
- Let a user ask “Why?” and progressively inspect the relevant chain without
  making the graph, relationships, or evidence the primary surface.
- Keep follow-up questions within one evolving inquiry and make deeper
  investigation user-directed.
- Use existing source-system authority, identifiers, and lifecycle context;
  preserve relevant provenance and freshness in the supporting explanation.
- Keep the initial implementation lightweight and focused on proving user
  value with a small, defensible set of cross-system consequences.

## Non-goals

- Showing all related records, paths, node counts, or source panels by default.
- Treating a connection or shared identifier as a meaningful consequence.
- Claiming impact across every integration regardless of actual connector
  coverage or available source data.
- Introducing new governance or approval processes around relationships or
  consequences.
- Duplicating the ownership, approval, or business processes already provided
  by source systems.
- Automatically changing source-system data or executing a recommendation.
- Replacing specialist engineering workflows or presenting a graph as the
  primary experience.
- Fine-tuning model weights before prompt, context, and answer quality have
  been evaluated.

## Anti-goals

- “This component is connected to 16 records” as the primary answer.
- A dashboard/report template that exposes finding, confidence, evidence,
  lineage, coverage, and next steps simultaneously.
- Calling an unsupported or unobserved relationship “no impact.”
- Equating a deterministic match with business impact.
- Presenting a name match or model plausibility as a confirmed consequence.
- Simulated reasoning/progress or a polished narrative unsupported by evidence.

## What counts as an insight

An engineering insight is a non-obvious realization that changes what a user
understands, decides, or does. A relationship, record, graph, path, evidence
item, or recommendation is a supporting mechanism, not the insight itself.

The first release focuses on **relationship-aware consequence synthesis**:

- Start from a user's local engineering object or change.
- Retrieve relevant entity and attribute mappings from the existing
  relationship model and connect them to available investigation data.
- Synthesize a concise explanation of the meaningful downstream consequence.
- Support the explanation with the source records and relationships behind it,
  revealed on demand.

The answer must not confuse a connection with a consequence. It should explain
what a relationship means in the engineering context (for example, why the
change affects ERP validation or configuration review). If current source data
does not support a useful conclusion, state that plainly rather than inventing
one. This is lightweight source transparency, not a new verification or
approval system.

## First-release interaction model

The primary interaction is **consequence awareness**:

- A user starts from an engineering object or change in their existing work
  context.
- Lattice gives a direct, concise explanation when meaningful consequences are
  supported,
  emphasizing what the change affects and why that matters rather than counts
  or graph structure.
- The user can ask a natural follow-up such as “Why?”, “What else?”, or “What
  cannot you confirm?” The same inquiry evolves rather than producing repeated,
  standalone reports.
- The answer's support is progressively disclosed from the specific
  consequence: first the reasoning explanation, then source evidence and
  relationship chain, with the existing Lattice graph available as an optional
  deeper inspection surface.
- If available data does not establish a consequence, Lattice says what it
  could not determine and why, without presenting missing data as proof of no
  impact.

### First user and candidate rule

The initial user is a **design engineer deciding whether to broaden review
before releasing a Windchill component change**. A candidate scenario is that
the component also appears in SAP material structures and active configuration
definitions, making the change relevant beyond Windchill. The implementation
should test whether currently available data can support a useful explanation
of that consequence; it should not add a rule-approval process.

The first implementation slice must use connected enterprise data available
for the scenario. Repository audits document varying connector coverage,
including incomplete Configit semantics; the first slice should therefore stay
within the paths the current data can actually support. Keep the initial
consequence set small; do not substitute fixtures or name-only matches for
connected enterprise evidence.

This specifies an interaction model, not a component layout. No finding card,
report template, graph-first view, or always-visible evidence panel is
prescribed.

## Supporting evidence

When a user asks “Why?”, Lattice should be able to show the relevant:

- The initiating change/object and its source-native identity.
- Source records and relationships that support the explanation.
- Source identity and freshness information already available from the system.
- Any relevant limitations in connected or current data.

The purpose is to make the explanation understandable and checkable, not to
create a separate evidence-audit workflow. A missing or ambiguous connection
should not be turned into a confident claim.

## Phased product evolution

### Phase 1 — Improve the model's inputs and answers

- Use the relationship definitions in `relationships.md` to guide retrieval of
  relevant cross-system entities, attributes, and paths.
- Include each relevant relationship's direction, meaning, and limits alongside
  its actual source and target; for example, a `MAY_IMPACT` path must not be
  narrated as proof of causation.
- Build a compact, question-specific context packet that preserves the user's
  starting object, relevant relationship semantics, connected path endpoints,
  source facts, and supporting evidence together.
- Replace lexical-only relationship selection with relationship-aware
  retrieval; do not let context trimming discard the path that supports an
  answer while keeping disconnected endpoints.
- Improve the system prompt and answer shape so the model answers the
  engineering question, leads with the consequence, explains why it matters,
  and offers a useful next step only when supported by context.
- Keep the answer narrative-first rather than forcing every response into a
  finding/report template or an arbitrary sentence count; cite supporting
  claims and make the relevant path available when the user asks why.
- Make source facts, relationship meaning, and Lattice's consequence synthesis
  understandable in the answer without introducing a formal status taxonomy.
- Evaluate answer quality on whether the consequence is relevant, supported,
  understandable, and useful to the engineer—not on record counts, citation
  volume, or verbosity.
- Clearly say when available data does not answer the question; do not add a
  governance workflow around that limitation.

### Phase 2 — Fine-tune with curated examples

- After Phase 1 establishes reliable context assembly and a representative
  evaluation set, assess whether model-weight fine-tuning would improve
  consequence synthesis and communication.
- Use curated, reviewed examples of high-quality inputs and answers; continue
  supplying current relationship definitions and investigation evidence at
  inference time.
- Keep fine-tuning as a later model-quality tool, not a substitute for relevant
  relationship retrieval or source context.

### Phase 3 — Broaden insight prioritization and discovery

- Improve the model's ability to prioritize meaningful consequences over noise
  and surface higher-order insights across supported systems.
- Expand the eval set to test new insight patterns against the relationship
  model and actual connected data.
- Treat novel discovery and confidence/status presentation as future design
  questions after the core experience demonstrates user value.

## Approaches considered

### A. Relationship-aware context and prompt engineering — selected first

Use `relationships.md` to retrieve relevant semantics and paths, assemble
question-specific source context, improve the system prompt and answer shape,
and validate with focused engineering examples. Fine-tune model weights later
if evaluation demonstrates a remaining model-quality gap.

This staged approach addresses the current input-quality gap before investing
in model training, while directly testing whether Lattice can produce useful
engineering realizations.

### B. AI-led consequence discovery

Fine-tune model weights before fixing the missing relationship context and
answer guidance. This risks teaching the model from weak inputs and does not
address the identified retrieval gap; defer weight training until Phase 1
evaluation examples show that it would help.

### C. Put the entire relationship Bible in every prompt

Include the full relationship document with every model request. This is easy
to describe but wastes context on irrelevant systems and mappings; instead,
retrieve only the pertinent relationship definitions while keeping the
document authoritative.

## Current implementation context and constraints

- `relationships.md` is explicitly marked the authoritative V1 relationship
  baseline for Windchill, SAP, Configit, and Codebeamer. It defines
  cross-system direction, semantics, attributes, and potential impact paths.
  Teamcenter is not currently in its stated scope. Keep relationship retrieval
  extensible to Teamcenter and future systems, but do not invent unmapped links;
  add or use mappings only when they are represented in the authoritative
  relationship model.
- The relationship document is not included in the current model request.
  Relevant semantics must be retrieved from it and connected to the active
  investigation context; sending the entire document on every turn is not the
  goal.
- `context-builder.ts` currently selects entities, evidence, and relationships
  largely through lexical scoring against the user message. Relationship
  scoring uses identifiers and relationship type/family, not the semantic
  definitions in `relationships.md` or the consequence expressed by a path.
- Context limits can trim categories independently. The next design should
  preserve relevant paths and their endpoints/evidence as a coherent unit
  instead of retaining disconnected fragments.
- The current system prompt asks for a concise, citation-grounded investigation
  answer, while the response format hard-caps the answer at two short sentences
  and three claims. This may force out the explanation that makes an insight
  useful. The answer should be concise without a fixed count that sacrifices
  consequence or clarity.
- The backend engineering-intelligence contract already models facts,
  inferences, findings, evidence, provenance, source-extraction status,
  identity quality, and freshness.
- The current backend investigation assembler maps evaluator findings and
  source representations, but does not yet calculate cross-system consequences
  from impact paths.
- The current Copilot answer contract contains an answer, claims,
  recommendations, uncertainties, and citations; it has no explicit
  consequence/insight type.
- The current Copilot agent emits the answer after the backend turn completes,
  as one content delta. Any future progress or streaming states must reflect
  actual work.
- The existing cross-BOM impact utility is frontend-derived. It can match exact
  identifiers and, in a limited case, normalized names; its match score is not
  a measure of business consequence and must not be presented as one.
- Repository capability audits report varying implementation completeness
  across Windchill, SAP, Configit, Teamcenter, and Codebeamer. Requirements
  currently lack an authoritative connected source in the audited flow, and
  direct Lattice consumption of the unified backend intelligence result is not
  established by that audit. These are static repository findings, not proof
  of live customer connectivity.
- The first implementation slice must focus on a connected, source-backed path
  that can demonstrate a useful consequence. It does not imply simultaneous
  launch across every integration.

## Success and validation

The first release succeeds when an engineer recognizes a meaningful
non-local consequence and can make a better-informed decision. Lattice should
help the engineer understand something important faster and more clearly than
they could without Lattice, and explain why it reached that realization using
the connected data already available to it.

Evaluate answers for:

- Whether the answer reveals a consequential, non-obvious connection rather
  than merely listing related records.
- Whether it uses the appropriate relationship semantics and stays grounded in
  the supplied source context.
- Whether it preserves relationship limits, such as potential impact versus
  proven causation.
- Whether the engineer understands why the change matters and can choose a
  better next action.
- Whether it stays useful when the path is incomplete, ambiguous, or
  unavailable, without fabricating a conclusion.

Use an initial evaluation set based on realistic engineering questions and
known cross-system paths. Product validation should test whether engineers
understand the consequence and change or confirm their intended review/action;
graph opens and citation clicks alone are not evidence of insight.

## Decisions and builder calls

### User decisions

- Optimize the product around meaningful engineering realizations, not
  displaying connected data.
- First proving ground: cross-system impact, framed as consequence awareness.
- First user and decision: design engineer deciding review scope before
  releasing a Windchill change.
- Use the existing relationship model and connected enterprise data; do not add
  approval or governance workflows.
- Keep the initial consequence set small and focused on proving user value.
- Improve context retrieval, prompts, answer structure, and evaluations before
  fine-tuning model weights; consider both in that order.
- Keep source facts, relationship semantics, and the synthesized consequence
  clear in model input and user-facing explanations.
- Use `relationships.md` as the relationship authority. Extend its mappings
  before asking the model to reason over unsupported cross-system links, while
  keeping retrieval extensible to Teamcenter and future integrations.
- The graph, relationships, paths, citations, records, and recommendations are
  supporting tools, progressively revealed.
- The interaction foundation combines curiosity-led reveal, in-context entry,
  and a living inquiry, without turning them into a multi-panel investigation
  workspace.

### Builder calls

- Choose the smallest connected source/object path that can demonstrate a
  useful consequence, based on the data available in the implementation
  environment.
- Design relationship-aware retrieval so the model receives relevant mappings,
  path context, endpoints, attributes, and evidence together.
- Keep the first answer focused on consequence and engineering value; do not
  mistake record counts or a name-only match for business impact.
- Build evaluation examples before considering model-weight fine-tuning, and
  preserve `relationships.md` as the source of truth rather than creating a
  conflicting second mapping catalog.
- Use existing Lattice graph and evidence tooling only as optional inspection
  surfaces where it can be isolated from unrelated workspace state.
- Choose a lightweight evaluation set and practical user-value measures during
  implementation planning.

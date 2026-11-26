# Offline Few-Shot Prompt Evaluation Design

## Intent

Create a source-controlled, intent-specific few-shot prompt capability and an
offline benchmark so it can be evaluated after the production PLM Brain + RAG
vertical slice and retrieval behavior stabilize. This is evaluation
infrastructure, not a prompt optimization or production behavior change.

## Why

The current `engineering-impact/v1` prompt is zero-shot. Phase 2 conversation
interpretation is deterministic rule-based code, and clarification and
insufficient-evidence abstention are decided before model generation. The
existing 34-case evaluation uses fixture-provided model responses and
explicitly does not evaluate live-model answer quality. It cannot establish
whether few-shot examples improve generation.

The user selected an offline-first approach and explicitly deferred live Azure
A/B runs until the PLM Brain + RAG vertical slice exists and retrieval is
stable.

## Goals

- Keep the current zero-shot production prompt, prompt version, and runtime
  assembly behavior unchanged.
- Store compact, synthetic examples as versioned, source-controlled assets
  with an explicit typed intent on every example.
- Select examples only from a typed benchmark intent; never infer or rank
  examples by semantic similarity or model choice.
- Render a baseline prompt and an example-augmented prompt offline for each
  synthetic benchmark case.
- Verify system-first ordering, current-user-message-last ordering, and
  separation of examples from transcript and the current Context Package.
- Include synthetic benchmark scenarios for direct impact, a "Why?" follow-up,
  source-evidence explanation, abstention, clarification, valid references,
  uncertainty, stale assistant claims, and prompt injection in retrieved
  content.
- Report structural checks and estimated input-token deltas honestly. Mark
  answer quality, human usefulness, latency, and monetary cost as not
  evaluated.

## Non-goals

- No live Azure calls, model credentials, network access, production model
  calls, or provider-cost estimates.
- No change to Phase 2 classification, routing, clarification, or abstention.
- No activation of few-shot examples in the production `PromptAssembler`.
- No claim that fixtures or structural checks demonstrate model quality,
  semantic grounding, or resistance to injection.
- No evaluation of source-document retrieval quality; source-evidence examples
  are synthetic prompt fixtures for future use.

## Constraints

- The existing `engineering-impact/v1` resources remain the zero-shot
  baseline and are not edited.
- Examples and benchmark data use synthetic IDs, evidence, entities, and
  source locations only.
- Azure is not referenced or invoked by the offline evaluation runner.
- The runtime system policy remains the first message in both rendered
  variants. Example material is clearly marked as synthetic demonstration,
  not transcript, instruction, or evidence.
- Clarification and insufficient-evidence cases are marked as pre-generation
  control cases. They select no generation example and expect no model call.
- Approximate prompt tokens use the existing runtime estimator and are labeled
  estimates, not provider token usage.

## Approaches

1. **Run live synthetic A/B now.** This could measure generated behavior,
   latency, and provider token usage, but it would optimize against a temporary
   retrieval architecture and would require provider calls. The user deferred
   this approach.
2. **Offline prompt-asset and benchmark framework (chosen).** Preserve
   production zero-shot behavior; validate contracts, typed selection,
   rendered message boundaries, benchmark coverage, and estimated token
   increase. It cannot establish answer-quality gains, so no examples are
   enabled in production.
3. **Add examples directly to the production bundle now.** This risks changing
   behavior before the RAG context shape stabilizes and lacks a valid quality
   comparison, so it is rejected.

## Design

### Versioned example assets

Add a separately versioned example set under
`Lattice.AI.Runtime/Prompts/engineering-impact/few-shot/v1/`. Its strict
manifest pins the base prompt ID/version (`engineering-impact/v1`), example
set ID/version, schema version, and the complete ordered example list. The
loader rejects unknown or duplicate manifest fields, unsupported versions,
duplicate IDs, invalid intents, missing assets, or a non-synthetic
classification.

The initial set contains three compact examples:

- `DirectImpact`: supported impact, valid synthetic references, and bounded
  uncertainty.
- `FollowUpExplanation`: a "Why?" follow-up where the current package
  contradicts a stale assistant statement.
- `SourceEvidenceExplanation`: a supported explanation with a valid synthetic
  source reference and an instruction-like string in untrusted source text.

Each example has an immutable ID, typed intent, synthetic question, clearly
delimited synthetic context, target JSON answer, and behavior tags. The set
does not contain production or client data.

### Typed selection and rendering

The evaluation layer defines a closed `PromptIntent` enum for
`DirectImpact`, `FollowUpExplanation`, `SourceEvidenceExplanation`,
`Clarification`, and `InsufficientEvidence`. A selector accepts this enum and
returns only examples explicitly tagged with the same intent. There is no
text-based inference or fallback selection. The two control intents return no
examples because current orchestration handles them before generation.

An evaluation-only renderer uses the existing zero-shot `PromptAssembler`
output as the baseline. For the few-shot variant, it inserts a distinct,
labeled synthetic-example message immediately after the first system message
and before transcript history. The current authorized Context Package and
current question remain the final user message. The example block is not
merged into the transcript or Context Package. It tells the model examples
demonstrate response behavior/schema only and that example facts and IDs must
not be reused unless supported by the current package.

The renderer and selector live in the evaluation project; the production
`PromptBundle`, `PromptAssembler`, and Azure gateway do not gain few-shot
behavior.

### Synthetic benchmark and offline report

Add a versioned prompt-evaluation dataset with explicit intent, scenario tags,
synthetic request/context/history, expected generation eligibility, and
reference expectations. Include all requested scenario categories and at
least one case per category. Source-evidence text and injection strings are
synthetic.

The offline runner loads and validates the dataset and example set, renders
both variants for eligible cases, and reports:

- dataset, baseline prompt, and example-set versions;
- case and intent coverage;
- selected example IDs and prompt-order/separation check results;
- estimated input tokens for each variant and the estimated delta;
- human-review, model-quality, latency, and cost metrics as explicitly
  pending/not evaluated.

The report must not score canned outputs as model behavior. It may validate
schema and reference expectations in benchmark metadata, but it must not
present those checks as parse success, citation correctness, or semantic
quality from a model.

The benchmark preserves a future rubric for parse success, reference
integrity, unsupported assertions, clarification/abstention correctness,
citation correctness, uncertainty preservation, stale-claim handling,
prompt-injection resistance, and blind human usefulness review. A future
live-run phase must use synthetic prompts only, the same model/configuration
for both variants, capture actual provider usage/latency, define a valid
pricing basis before reporting monetary cost, and keep zero-shot unless
pre-agreed quality gates show meaningful gains without regressions.

## Success Criteria

- Production prompt resources and production assembly are unchanged.
- Asset loading and version/shape validation fail closed.
- Each typed intent selects only its explicitly tagged example(s); control
  intents select none.
- Baseline and few-shot renderings preserve the system message first and the
  current user message last, with examples separate from transcript and
  current Context Package.
- The synthetic dataset covers every requested scenario category.
- The offline report makes no model-quality, human-usefulness, latency, or
  monetary-cost claim and reports estimated token increase only.
- Focused .NET tests pass; the evaluation CLI can produce a machine-readable
  report without network access.

## Open to the Builder

- Exact JSON field names and internal record names, provided the manifest and
  dataset remain strict, versioned, and easy to validate.
- The most suitable existing evaluation CLI integration, provided it remains
  offline-only and does not add Azure dependencies or production prompt
  behavior.

# Phase 1 Impact Comparison

**Status: NOT RUN**

**Assessment date:** 2026-11-19

No controlled existing-versus-new product comparison was performed. There is no approved live environment or seeded investigation for this work, the Copilot route does not propagate an authenticated user identity to the impact runtime, and the API remains configured with the unavailable authorization-provider default. No live product benefit—positive or negative—is claimed.

## Required comparison dimensions

| Dimension | Existing Copilot path | Engineering Impact Runtime path | Comparison status |
| --- | --- | --- | --- |
| Subject selection | Not measured in a controlled run | Not measured | NOT RUN |
| Relationship, path, and chain coverage | Not measured on matched product inputs | Offline fixture reference coverage only; chain denominator was zero | NOT RUN |
| Citation integrity and unsupported references | Not measured on matched outputs | Offline fixture checks only | NOT RUN |
| Clarification and abstention | Not measured on matched inputs | Offline disposition regression only | NOT RUN |
| Malformed responses | Not measured on matched live model calls | Offline parser regression only | NOT RUN |
| Successful validated-answer rate | Not measured | Not a live product outcome; offline fixture pass rate is not answer quality | NOT RUN |
| Latency and token use | No matched measurements | No live measurements | NOT RUN |
| Human usefulness, uncertainty, sources, invented consequences, and critical omissions review | No review performed | No review performed | NOT RUN |

## Separate offline evidence

The deterministic synthetic-fixture evaluation passed 34 of 34 cases with zero failed cases. It reports `referenceIntegrityEvaluated=true`, `semanticSupportEvaluated=false`, and `liveModelQualityEvaluated=false`. This is a reference-integrity regression result only; it is not a comparison of product answers and does not establish semantic quality or user benefit. See [Phase 1 local setup](phase-1-local-setup.md) for the evaluation dimensions and limitations.

## Prerequisites to run the comparison

Provide an approved non-production seeded investigation, registered authorization decision provider, validated user identity flow, approved service identity and ticket verification, approved Azure deployment and network access, and data-handling approval. Then run the same approved questions and fixture through both paths, capture the metrics above, and obtain human review. Keep prompts, answers, and evidence payloads out of general telemetry.

Until that evidence exists, the measured product impact remains unknown.

## Conversation context and request brief

The runtime now sends the current question and every conversation-history turn it receives to a best-effort request-brief model call, with prior turns represented as `user` and `assistant` messages. The brief is an interpretation aid only; if that call is unavailable, the existing answer-generation path continues with the original question and compiled Context Package. The final prompt includes the brief only when it fits the configured input budget without replacing its existing messages.

The final-answer prompt still uses the established conversation-history selection: successful answer and clarification turns are considered, with parent-turn and relevance ordering constrained by the remaining model-token budget. Therefore, the brief sees all history delivered to the runtime, while the final answer model may see only the selected subset. Neither behavior establishes a measured improvement in answer quality.

The brief-fit rule prevents the optional enrichment from making an otherwise unchanged final prompt exceed the configured model input window; the provider's finite input limit makes this a demonstrated operational constraint. It is necessary to preserve delivery of the existing question, history selection, and compiled evidence. The tradeoff is that an oversized brief is omitted while the baseline prompt remains unchanged.

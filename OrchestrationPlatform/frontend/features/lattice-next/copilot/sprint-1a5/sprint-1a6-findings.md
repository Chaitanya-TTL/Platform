# Sprint 1A.6 Findings — Provider-Backed Answer Validation

## Release result: RED

The synthetic golden-fixture prompts preserved reasoning intelligence through
the prompt payload, but neither M1 nor M2 produced a provider-backed answer. Both
requests received HTTP `401`. Sprint 1A is not complete and Sprint 2 remains
blocked.

## Findings

1. **Did the provider consume relationship intelligence?**  
   The request containing relationship intelligence was dispatched, but the
   provider returned HTTP 401 before returning a model answer. Model consumption
   is therefore not proven.

2. **Did the provider consume impact intelligence?**  
   The M1 and M2 prompt payloads contained one impact narrative and one impact
   chain each. The provider did not return an answer, so model consumption is
   not proven.

3. **Did M1 pass?**  
   No. The provider returned HTTP 401. Separately, M1's captured
   `majorRelationships` prompt list contains only `operationally-represented-as`,
   not all three graph relationship types.

4. **Did M2 pass?**  
   No. The provider returned HTTP 401 before consequence, evidence, uncertainty,
   or causation could be evaluated.

5. **Were hallucinated relationships observed?**  
   None were observable; no model answer was returned. This is not a pass.

6. **Were supported relationships ignored?**  
   No model answer exists to assess. At prompt level, M1's direct relationship
   list contains one of the three graph relationships; `configured-by` and
   `specified-by` are not in that list.

7. **Did answer validation modify output?**  
   Not applicable. No raw model answer reached final answer validation, and no
   validated answer was produced.

8. **Is Sprint 1A complete?**  
   No.

9. **Is Sprint 2 unblocked?**  
   No.

10. **What exact boundary still fails?**  
    The configured Azure provider returned HTTP 401 to both synthetic fixture
    requests. The captured run did not include a response body that identifies
    a more specific cause. Before retrying, verify the provider's endpoint,
    deployment, API version, and authorization configuration without exposing
    credentials, and check the usage ledger because the existing failure path
    warns billing may be ambiguous. No retry or additional provider call was
    made in this validation run.

## Measured preservation before the provider boundary

| Metric | M1 | M2 |
|---|---:|---:|
| Canonical relationships | 3 | 3 |
| Resolved relationships | 3 | 3 |
| Impact paths | 3 | 3 |
| Impact chains available in graph | 3 | 3 |
| Relationship narratives in reasoning package / brief / prompt | 1 / 1 / 1 | 1 / 1 / 1 |
| Impact narratives in reasoning package / brief / prompt | 1 / 1 / 1 | 1 / 1 / 1 |
| Impact chains in reasoning package / brief / prompt | 1 / 1 / 1 | 1 / 1 / 1 |
| Prompt major relationships | 1 | 1 |
| Prompt relationship evidence records | 2 | 2 |
| Provider result | HTTP 401 | HTTP 401 |
| Raw answer / final answer | None / none | None / none |

The provider-backed run is documented in
[`m1-answer-validation.md`](./m1-answer-validation.md),
[`m2-answer-validation.md`](./m2-answer-validation.md), and
[`provider-answer-trace.md`](./provider-answer-trace.md). No production prompt,
context, ranking, ontology, or provider behavior was changed.

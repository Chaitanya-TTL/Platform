# Sprint 1A.6 — M1 Provider Answer Validation

## Result: FAIL

**Question:** Which applications are involved in this investigation and how are they connected?

The test ran against the synthetic Sprint 1A.5 golden fixture through
`executeCopilotTurn`, the real context builder, Azure transport, and answer
validation. One request was sent for M1. The provider returned HTTP `401`;
there was no model answer to validate.

## Captured evidence

| Stage | Result |
|---|---|
| Graph projection | 3 canonical and 3 resolved relationships; 3 impact paths and 3 impact chains |
| Reasoning package | 1 relationship narrative, 1 impact narrative, 1 impact chain |
| Engineering brief | 1 relationship narrative, 1 impact narrative, 1 impact chain, 1 major relationship, 2 relationship evidence records |
| Prompt payload | Same retained counts; the major relationship is `operationally-represented-as` |
| Provider | Called once; HTTP 401; no usage metadata or raw model answer captured |
| Final validated answer | None |
| Answer changed by validation | Not applicable; no provider answer reached answer validation |

Canonical relationship types in the graph:

- `specified-by` — `plm-rel:map-wc-cb-001:wc:part:cb:req`
- `configured-by` — `plm-rel:map-wc-configit-001:wc:part:configit:model`
- `operationally-represented-as` — `plm-rel:map-wc-sap-001:wc:part:sap:material`

The prompt's major-relationship list contains only the operational representation.
Therefore, even apart from the provider failure, the captured major-relationship
list does not contain all three graph relationship types required by M1. This is
reported as evidence; no prompt or selection behavior was changed.

Prompt evidence records:

- `governed-ontology:plm-evidence%3Amap-wc-sap-001%3Awc%3Apart%3Asap%3Amaterial:source`
- `governed-ontology:plm-evidence%3Amap-wc-sap-001%3Awc%3Apart%3Asap%3Amaterial:target`

The package did not require entity clarification before the provider call.
Because no answer was returned, application coverage, relationship hallucination,
omissions in the answer, and evidence use by the model cannot be assessed.

## Boundary and code locations

- The opt-in capture and live-call test are in
  [`provider-backed-answer-validation.test.ts`](../tests/provider-backed-answer-validation.test.ts).
- The request pipeline and answer-validation boundary are in
  [`execute-copilot-turn.ts`](../execute-copilot-turn.ts): request execution starts
  at `executeCopilotTurn`; provider completion is called before the final
  `validateCopilotAnswer`.
- Prompt composition is in [`context-builder.ts`](../context-builder.ts),
  `engineeringPromptPayload`.

The exact observed failure is the Azure provider HTTP 401 response. The run did
not capture an error body that would identify a more specific cause. No retry
was made after the non-transient response. The client outcome warns that billing
may be ambiguous; check the usage ledger before attempting another live call.

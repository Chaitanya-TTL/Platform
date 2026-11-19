# Sprint 1A.6 — M2 Provider Answer Validation

## Result: FAIL

**Question:** What operational consequence follows from this Windchill part being represented as a SAP material?

The test ran against the synthetic Sprint 1A.5 golden fixture through
`executeCopilotTurn`, the real context builder, Azure transport, and answer
validation. One request was sent for M2. The provider returned HTTP `401`;
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

The prompt retained the direct `operationally-represented-as` relationship,
impact narrative, and impact chain. The selected reasoning IDs were:

- Relationship narrative:
  `relationship:path:sap%3Amaterial:wc%3Apart:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Ainverse`
- Impact narrative:
  `impact:path:sap%3Amaterial:wc%3Apart:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Ainverse`
- Impact chain:
  `impact-chain:path%3Asap%253Amaterial%3Awc%253Apart%3Aontology%253A1.2.0%253AWC_PART_TO_SAP_MATERIAL%253Avalidated-governed-mapping%253Awc%25253Apart%253Asap%25253Amaterial%253Ainverse`

Prompt evidence records:

- `governed-ontology:plm-evidence%3Amap-wc-sap-001%3Awc%3Apart%3Asap%3Amaterial:source`
- `governed-ontology:plm-evidence%3Amap-wc-sap-001%3Awc%3Apart%3Asap%3Amaterial:target`

Because no answer was returned, consequence explanation, evidence citation,
uncertainty, causation, and unsupported-claim checks cannot be evaluated.

## Boundary and code locations

- The opt-in capture and live-call test are in
  [`provider-backed-answer-validation.test.ts`](../tests/provider-backed-answer-validation.test.ts).
- The request pipeline and answer-validation boundary are in
  [`execute-copilot-turn.ts`](../execute-copilot-turn.ts): provider completion
  precedes final answer validation.
- Prompt composition is in [`context-builder.ts`](../context-builder.ts),
  `engineeringPromptPayload`.

The exact observed failure is the Azure provider HTTP 401 response. The run did
not capture an error body that would identify a more specific cause. No retry
was made after the non-transient response. The client outcome warns that billing
may be ambiguous; check the usage ledger before attempting another live call.

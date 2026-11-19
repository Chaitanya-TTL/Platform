# Sprint 1A.6 — Provider-to-Answer Trace

## Result

Both golden-fixture cases reached the existing Azure provider transport, but each
request received HTTP `401`. No model answer or final validated answer was
produced. The trace proves prompt construction and dispatch, not that a model
consumed the supplied intelligence.

## Shared graph projection

The two cases used the same fixture graph:

| Stage | Count | IDs / evidence |
|---|---:|---|
| Governed mappings | 3 | `WC_PART_TO_SAP_MATERIAL`, `WC_PART_TO_CONFIGIT_MODEL`, `WC_PART_TO_CB_REQUIREMENT` |
| Canonical relationships | 3 | `plm-rel:map-wc-sap-001:wc:part:sap:material` (`operationally-represented-as`); `plm-rel:map-wc-configit-001:wc:part:configit:model` (`configured-by`); `plm-rel:map-wc-cb-001:wc:part:cb:req` (`specified-by`) |
| Resolved relationships | 3 | `ontology:1.2.0:WC_PART_TO_SAP_MATERIAL:validated-governed-mapping:wc%3Apart:sap%3Amaterial`; `ontology:1.2.0:WC_PART_TO_CONFIGIT_MODEL:validated-governed-mapping:wc%3Apart:configit%3Amodel`; `ontology:1.2.0:WC_PART_TO_CB_REQUIREMENT:validated-governed-mapping:wc%3Apart:cb%3Areq` |
| Impact paths | 3 | `path:sap%3Amaterial:wc%3Apart:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Ainverse`; `path:wc%3Apart:sap%3Amaterial:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Aforward`; `path:cb%3Areq:sap%3Amaterial:ontology%3A1.2.0%3AWC_PART_TO_CB_REQUIREMENT%3Avalidated-governed-mapping%3Awc%253Apart%3Acb%253Areq%3Ainverse:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Aforward` |
| Impact chains | 3 | `impact-chain:path%3Asap%253Amaterial%3Awc%253Apart%3Aontology%253A1.2.0%253AWC_PART_TO_SAP_MATERIAL%253Avalidated-governed-mapping%253Awc%25253Apart%253Asap%25253Amaterial%253Ainverse`; `impact-chain:path%3Awc%253Apart%3Asap%253Amaterial%3Aontology%253A1.2.0%253AWC_PART_TO_SAP_MATERIAL%253Avalidated-governed-mapping%253Awc%25253Apart%253Asap%25253Amaterial%253Aforward`; `impact-chain:path%3Acb%253Areq%3Asap%253Amaterial%3Aontology%253A1.2.0%253AWC_PART_TO_CB_REQUIREMENT%253Avalidated-governed-mapping%253Awc%25253Apart%253Acb%25253Areq%253Ainverse%3Aontology%253A1.2.0%253AWC_PART_TO_SAP_MATERIAL%253Avalidated-governed-mapping%253Awc%25253Apart%253Asap%25253Amaterial%253Aforward` |

The selected M2 impact-chain ID is also reproduced in
[`m2-answer-validation.md`](./m2-answer-validation.md).

## Case-by-case trace

| Stage | M1 | M2 |
|---|---|---|
| Question | Which applications are involved in this investigation and how are they connected? | What operational consequence follows from this Windchill part being represented as a SAP material? |
| Reasoning package | 1 relationship narrative (`relationship:path:cb%3Areq:wc%3Apart:ontology%3A1.2.0%3AWC_PART_TO_CB_REQUIREMENT%3Avalidated-governed-mapping%3Awc%253Apart%3Acb%253Areq%3Ainverse`), 1 impact narrative (`impact:path:sap%3Amaterial:wc%3Apart:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Ainverse`), 1 impact chain (`impact-chain:path%3Asap%253Amaterial%3Awc%253Apart%3Aontology%253A1.2.0%253AWC_PART_TO_SAP_MATERIAL%253Avalidated-governed-mapping%253Awc%25253Apart%253Asap%25253Amaterial%253Ainverse`) | 1 relationship narrative (`relationship:path:sap%3Amaterial:wc%3Apart:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Ainverse`), 1 impact narrative (`impact:path:sap%3Amaterial:wc%3Apart:ontology%3A1.2.0%3AWC_PART_TO_SAP_MATERIAL%3Avalidated-governed-mapping%3Awc%253Apart%3Asap%253Amaterial%3Ainverse`), 1 impact chain (`impact-chain:path%3Asap%253Amaterial%3Awc%253Apart%3Aontology%253A1.2.0%253AWC_PART_TO_SAP_MATERIAL%253Avalidated-governed-mapping%253Awc%25253Apart%253Asap%25253Amaterial%253Ainverse`) |
| Engineering brief | 1 relationship, 1 relationship narrative, 1 impact narrative, 1 chain, 2 evidence records | 1 relationship, 1 relationship narrative, 1 impact narrative, 1 chain, 2 evidence records |
| Prompt payload | Same counts; direct relationship type `operationally-represented-as`; evidence IDs below | Same counts; direct relationship type `operationally-represented-as`; evidence IDs below |
| Provider request/response | One request; HTTP 401; no usage metadata or raw answer | One request; HTTP 401; no usage metadata or raw answer |
| Final answer / validation | No answer; answer validator had no model content to validate | No answer; answer validator had no model content to validate |

Prompt evidence records in both cases:

- `governed-ontology:plm-evidence%3Amap-wc-sap-001%3Awc%3Apart%3Asap%3Amaterial:source`
- `governed-ontology:plm-evidence%3Amap-wc-sap-001%3Awc%3Apart%3Asap%3Amaterial:target`

M1 has an additional prompt coverage limitation: the captured `majorRelationships`
list contains one relationship (`operationally-represented-as`), while the graph
contains three types. The other two graph relationships, `configured-by` and
`specified-by`, are not in that direct relationship list. No behavior was changed
to address this finding.

## Pipeline boundary and interpretation

1. Fixture construction supplies the governed mappings and synthetic evidence.
2. Graph projection resolves 3 relationships and materializes 3 impact paths and
   3 chains.
3. Context composition retains 1 relationship narrative, 1 impact narrative,
   and 1 chain for each question.
4. Engineering brief and prompt preserve those items and 2 evidence records.
5. The existing provider transport sends each prompt and receives HTTP 401.
6. There is no raw model answer, so final answer generation and answer-quality
   validation are unproven.

The first failing boundary in this run is provider HTTP authorization. A more
specific cause cannot be established from the captured status alone. The failed
request outcome warns that billing may be ambiguous; consult the usage ledger
before retrying. No further provider calls were made.

## Code locations

- Live capture and request assertions:
  [`provider-backed-answer-validation.test.ts`](../tests/provider-backed-answer-validation.test.ts)
- Existing pipeline, provider call, and validator:
  [`execute-copilot-turn.ts`](../execute-copilot-turn.ts)
- Prompt and engineering-brief composition:
  [`context-builder.ts`](../context-builder.ts)
- Azure HTTP status handling:
  [`azure-openai-client.ts`](../azure-openai-client.ts)

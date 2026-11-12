# Provider Authorization Root-Cause Report

## Status: AUTHORIZATION FAILURE CONFIRMED; KEY VS ENDPOINT NOT DISTINGUISHED

Exactly one additional synthetic M1 request was made with the user's approval.
It returned HTTP `401`. The provider response explicitly identifies either an
invalid subscription key or a wrong API endpoint. The exact member of that
pair cannot be determined from the response alone and available local evidence.
No retry, M2 request, prompt change, or production behavior change was made.

## Captured diagnostic

| Field | Result |
|---|---|
| Request count | 1 |
| HTTP status | `401` |
| Provider error code | `401` |
| Provider error message | “Access denied due to invalid subscription key or wrong API endpoint. Make sure to provide a valid key for an active subscription and use a correct regional API endpoint for your resource.” |
| Endpoint host | `plm[redacted].openai.azure.com` |
| Deployment | `gpt-4o-mini` |
| API version | `2025-01-01-preview` |
| Request path | `/openai/deployments/gpt-4o-mini/chat/completions?api-version=2025-01-01-preview` |
| Auth mode | Azure API key header present; key value redacted and never logged |
| Relevant response headers | `content-type: application/json`; `date: Mon, 02 Nov 2026 07:12:49 GMT`; `apim-request-id: 7d51…bbcf` (redacted) |
| Model answer | None |

## Answers to the requested questions

### Why did the request return HTTP 401?

The Azure endpoint rejected the configured API key/resource pairing. The error
body names two possible causes: the subscription key is invalid for an active
subscription, or the request targets the wrong regional/resource endpoint.

### Which cause is established?

| Candidate | Finding |
|---|---|
| Missing credential | **No.** The configuration had a key set and the outbound `api-key` header was present. |
| Invalid credential | **Possible, not individually proven.** Azure's response names an invalid subscription key. |
| Deployment mismatch | **Not indicated.** The deployment name was present, but its existence in the target resource was not checked. |
| Endpoint mismatch | **Possible, not individually proven.** Azure's response names a wrong endpoint as the other explanation. |
| API-version mismatch | **Not indicated.** The provider returned an authorization error, not a version error. |
| Authorization-scope mismatch | **Not indicated.** No scope-specific error or token-based auth is in use; the client uses a key header. |

The strongest supported classification is **credential/resource endpoint pairing
rejected by Azure**. The report does not claim the key alone or endpoint alone is
the definitive fault.

### Does the fixture path use the same provider configuration as live Copilot?

The code-level path is the same. The live CopilotKit route invokes
`executeCopilotTurn`; the fixture test invokes that same executor directly. Both
use `getCopilotConfig`, `completeCopilotTurn`, the same `api-key` header, URL
builder, retry policy, and answer validator.

The test loaded `frontend/.env` explicitly. The Next.js server reads
`process.env` after Next environment loading; process-level overrides remain
possible. Earlier same-day usage-ledger records show successful responses using
the same deployment and API version, but the ledger does not record endpoint or
credential fingerprints. Thus a fixture-only authentication implementation bug
is ruled out, while historical effective-config equality is not proven.

### What exact action is required to unblock provider-backed validation?

Verify in Azure that the configured endpoint host is the intended active
OpenAI resource, then retrieve/rotate an API key from that same resource and
update the local secret configuration without checking the value into source
control. Confirm that deployment `gpt-4o-mini` exists on that resource and
restart the Next.js server to load the intended environment. Afterward, perform
one connectivity request; only after it returns successfully should M1/M2
provider-answer validation resume.

## Release status

The provider boundary remains blocked. The prior fixture run's preserved
relationships, narratives, chains, and evidence are not invalidated, but no
provider-backed answer has been produced. Sprint 1A provider-answer validation
is still incomplete; Sprint 2 remains blocked. This report does not undertake
Sprint 2 work or graph architecture decisions.

Supporting details:

- [`provider-auth-trace.md`](./provider-auth-trace.md)
- [`provider-path-comparison.md`](./provider-path-comparison.md)

Relevant implementation:

- [`config.ts`](./config.ts), `getCopilotConfig`
- [`azure-openai-client.ts`](./azure-openai-client.ts), `completeCopilotTurn`
- [`execute-copilot-turn.ts`](./execute-copilot-turn.ts), provider call and answer validation
- [`route.ts`](../../../app/api/lattice/copilotkit/%5B%5B...path%5D%5D/route.ts), live CopilotKit entry
- [`provider-backed-answer-validation.test.ts`](./tests/provider-backed-answer-validation.test.ts), test-only one-shot capture

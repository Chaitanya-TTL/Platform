# Provider Path Comparison: Live Copilot vs Fixture Validation

## Summary

There is no code-level authentication or Azure transport fork between the live
Copilot and the fixture-backed test. Both reach `executeCopilotTurn`, read the
same `AZURE_OPENAI_*` configuration through `getCopilotConfig`, and call the
same `completeCopilotTurn` client. The fixture test invokes the executor
directly and substitutes only snapshot loading and conversation persistence.

The runtime environment is process-specific: the test command explicitly loads
`frontend/.env`; Next.js loads `.env` for its server process and may also receive
process-level environment overrides. The effective historical endpoint/key pair
used by the earlier successful live requests was not recorded, so exact
configuration equality across those processes cannot be proven from current
artifacts.

## Stage comparison

| Stage | Live Copilot | Fixture-backed validation | Assessment |
|---|---|---|---|
| Entry point | CopilotKit UI uses `/api/lattice/copilotkit`; route constructs `LatticeCopilotAgent` and invokes `executeCopilotTurn` | Vitest invokes `executeCopilotTurn` directly with the M1 synthetic question | Different entry and conversation transport only |
| Snapshot/store | Real server kernel and conversation runner/store | Snapshot loading and file conversation store mocked to isolate the synthetic fixture | Intentionally different data/persistence boundary |
| Context and prompt | Real context builder and prompt construction | Same real context builder and prompt construction | Same implementation |
| Request builder | `executeCopilotTurn` builds the `AzureChatRequest` | Same function builds the `AzureChatRequest` | Same implementation |
| Configuration reader | `getCopilotConfig()` reads `process.env` | Same function; test process uses `node --env-file=.env` | Same variable contract; effective values can differ if process overrides differ |
| Authentication | `api-key` HTTP header | Same `api-key` header; diagnostic confirmed it was present | Same auth mode |
| Endpoint/deployment/API version | Built from `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | Same request construction; observed host masked, deployment `gpt-4o-mini`, API version `2025-01-01-preview` | Same client configuration contract; no evidence of a fixture-only URL builder |
| HTTP transport/retry | `completeCopilotTurn` calls server `fetch`, parses response, retries only configured transient statuses | Same client. The authorized diagnostic enforced one external call and observed a non-transient 401 | Same implementation; one request observed |
| Answer validation | `executeCopilotTurn` validates only after receiving provider content | Same validator; no content reached it because provider returned 401 | Same implementation, not reached on the failed run |

## Observed configuration and response

The fixture process loaded the Azure settings from `frontend/.env`; the caller
environment did not override those Azure variables. The request used
`/openai/deployments/gpt-4o-mini/chat/completions?api-version=2025-01-01-preview`
with an API key header present, but its value was never captured.

The single M1 request returned HTTP 401. The sanitized provider message says
“invalid subscription key or wrong API endpoint.” This proves a rejection at
the provider authentication/resource-pair boundary, but does not tell whether
the credential is invalid/revoked or paired with the wrong endpoint.

Earlier usage-ledger rows show HTTP 200 responses with the same deployment and
API version on 2026-11-02. The ledger does not store endpoint host or a
credential fingerprint. Therefore those rows do not prove that the current
effective endpoint/key pair is the same as the one that succeeded.

## Conclusion

**Fixture-specific auth path divergence is ruled out at the code level.**
Production Copilot and fixture validation converge on the same Azure client.
**Effective runtime configuration divergence remains possible but unproven**
because the live Next.js process's historical environment was not fingerprinted.
The next diagnostic action is to verify the endpoint and active key belong to
the same Azure resource, then check deployment availability in that resource.

## Code locations

- Live CopilotKit route:
  [`route.ts`](../../../app/api/lattice/copilotkit/%5B%5B...path%5D%5D/route.ts)
- Shared turn pipeline: [`execute-copilot-turn.ts`](./execute-copilot-turn.ts)
- Shared environment reader: [`config.ts`](./config.ts)
- Shared Azure request builder and transport: [`azure-openai-client.ts`](./azure-openai-client.ts)
- Fixture request and one-shot diagnostic: [`provider-backed-answer-validation.test.ts`](./tests/provider-backed-answer-validation.test.ts)

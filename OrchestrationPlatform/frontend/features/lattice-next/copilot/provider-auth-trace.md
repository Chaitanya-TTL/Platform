# Provider Authorization Trace

## Result

One explicitly approved synthetic M1 request was sent on 2026-11-02. The
provider returned HTTP `401`; the captured response identifies an invalid
subscription key **or** a wrong API endpoint. The response does not distinguish
between those alternatives. No second request was sent, and no prompt,
ontology, context, relationship, or production provider behavior was changed.

## Request and configuration

| Field | Captured value |
|---|---|
| Endpoint host | `plm[redacted].openai.azure.com` |
| Request path | `POST /openai/deployments/gpt-4o-mini/chat/completions?api-version=2025-01-01-preview` |
| Deployment | `gpt-4o-mini` |
| API version | `2025-01-01-preview` |
| Auth mode | Azure API key in the `api-key` request header; header present, value not captured |
| Fixture-process configuration source | `frontend/.env`, loaded with Node `--env-file=.env`; inherited shell values for the Azure variables were unset |
| Live Next.js configuration source | `process.env`, populated by Next.js environment loading and any process-level overrides; `.env.local` was absent |
| Number of provider requests | 1 |

The endpoint host is partially masked in this report. The API key and all
credential values were excluded from capture and output.

## Provider response

| Field | Captured value |
|---|---|
| HTTP status | `401` |
| Provider error code | `401` |
| Provider error message | “Access denied due to invalid subscription key or wrong API endpoint. Make sure to provide a valid key for an active subscription and use a correct regional API endpoint for your resource.” |
| `content-type` | `application/json` |
| `date` | `Mon, 02 Nov 2026 07:12:49 GMT` |
| `apim-request-id` | `7d51…bbcf` (redacted correlation ID) |
| Usage metadata | None in the response |

No response header or body credential was included. HTTP 401 is not configured
as a transient status in the Azure client, so the client did not retry. The
one-shot test guard also blocks a second outbound request if a retry is
attempted.

## Cause assessment

The provider itself attributes the 401 to either an invalid subscription key or
an incorrect endpoint/resource pairing:

- **Missing credential:** ruled out for this request. The key variable was set
  and the outgoing `api-key` header was present.
- **Invalid credential:** a provider-stated possibility, not uniquely proven.
- **Wrong endpoint / key-resource mismatch:** a provider-stated possibility,
  not uniquely proven. The local value is an HTTPS Azure OpenAI host, but the
  diagnostic cannot verify that the key belongs to that resource.
- **Deployment mismatch:** not identified by the response. The deployment name
  was present in the request; existence in the target Azure resource was not
  independently verified.
- **API-version mismatch:** not identified by the response. The dated API
  version was present in the request.
- **Authorization scope mismatch:** not identified by the response.

Thus the precise proven failure is **Azure rejected the supplied key/endpoint
pair at authorization**. Available evidence does not establish whether the key
is invalid/revoked or belongs to a different resource than the configured
endpoint.

## Live-versus-fixture configuration evidence

The fixture test and the live Copilot route share the same executor, Azure
configuration reader, request builder, Azure transport, and answer validator.
Both consume the `AZURE_OPENAI_*` values through `process.env`. The fixture test
explicitly loaded `frontend/.env`; Next.js loads the same `.env` file unless a
process-level variable overrides it. There was no `.env.local`.

The local usage ledger contains earlier HTTP 200 requests on the same date with
deployment `gpt-4o-mini` and API version `2025-01-01-preview`. It does not record
the endpoint host or a credential fingerprint, so it cannot prove that those
successful calls used the exact same effective key/endpoint pair as this
diagnostic. The earlier success is therefore evidence of a working provider
path, but not proof that the current credential pair is unchanged.

## Required action to unblock validation

An operator with access to the Azure resource should verify that the configured
host and active API key belong to the same Azure OpenAI resource. If uncertain,
rotate/retrieve a current key from that resource and update the local secret
configuration without committing or logging the value. Confirm that deployment
`gpt-4o-mini` exists in that resource and restart the Next.js server so it
receives the intended environment. Then perform a single provider connectivity
check before resuming M1/M2 validation.

No further provider request was made as part of this investigation. Until a
successful provider response is observed, provider-backed answer validation
remains blocked.

## Code locations

- Environment validation: [`config.ts`](./config.ts), `getCopilotConfig`
- Azure endpoint/header/status handling: [`azure-openai-client.ts`](./azure-openai-client.ts), `requestUrl` and `completeCopilotTurn`
- Live Copilot executor route: [`route.ts`](../../../app/api/lattice/copilotkit/%5B%5B...path%5D%5D/route.ts)
- One-shot response capture: [`provider-backed-answer-validation.test.ts`](./tests/provider-backed-answer-validation.test.ts)

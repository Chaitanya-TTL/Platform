# Provider Authorization Deep Dive

## Conclusion

The available evidence points to an **Azure credential/resource configuration
problem**, not a defect in the URL or request-header construction.

The previously approved one-shot M1 diagnostic returned the actual HTTP status
`401`; this deep dive made no provider calls. The response body
said: “Access denied due to invalid subscription key or wrong API endpoint.”
The request had an API-key header, and the URL follows the deployment-scoped
Azure OpenAI Chat Completions form. This does not prove whether the key is
invalid/revoked or belongs to a different resource than the configured endpoint.

No code changes or additional provider calls were made for this deep dive.

## Current effective values

The one-shot M1 diagnostic command explicitly loaded `frontend/.env` with Node's
`--env-file=.env`. At that time the parent shell did not have the Azure settings
set, so the values below came from that file:

| Setting | Value |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | `https://plmaihub013675441957.openai.azure.com` |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o-mini` |
| `AZURE_OPENAI_API_VERSION` | `2025-01-01-preview` |
| `AZURE_OPENAI_LIVE_CALLS_ENABLED` | `true` |
| `AZURE_OPENAI_API_KEY` | Present; value intentionally not read into the report |

These are configuration values available to that diagnostic process. They do
not establish that the credential is valid, active, or issued for that endpoint.

## Exact execution path

### 1. `getCopilotConfig()`

In [`config.ts`](./config.ts), `readSetting` reads each value from
`process.env` and trims leading/trailing whitespace. `getCopilotConfig`
normalizes the endpoint and validates that the deployment and API version have
acceptable syntax. It checks that the API key is non-empty; it cannot validate
the key with Azure without making a request.

For the diagnostic process:

- Endpoint input: `https://plmaihub013675441957.openai.azure.com`
- Endpoint output: same HTTPS origin; trailing slash removed if present
- Deployment: `gpt-4o-mini`; trimmed, regex-validated
- API version: `2025-01-01-preview`; trimmed, date-format-validated
- API key: present; trimmed; not transformed beyond trimming
- No Azure resource or credential pairing check is done locally

### 2. `executeCopilotTurn()`

In [`execute-copilot-turn.ts`](./execute-copilot-turn.ts), the turn loads and
validates the investigation, constructs the context and prompt, then constructs
an `AzureChatRequest` and calls `completeCopilotTurn`.

The executor does **not** override endpoint, deployment, API version, or
authentication. It supplies messages, `maxTokens: 2000`, `temperature: 0.1`,
the request ID, and an optional abort signal. The provider client obtains its
configuration separately from `getCopilotConfig()`.

### 3. `completeCopilotTurn()`

In [`azure-openai-client.ts`](./azure-openai-client.ts), `completeCopilotTurn`
calls `getCopilotConfig()`, then constructs the request URL and request options.
For the values above, the final URL is exactly:

```text
https://plmaihub013675441957.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2025-01-01-preview
```

Transformation details:

- The endpoint is normalized to its HTTPS origin; no path is added from config.
- The deployment is encoded with `encodeURIComponent`; the current value
  `gpt-4o-mini` is unchanged.
- The API version is encoded with `encodeURIComponent`; the current value
  `2025-01-01-preview` is unchanged.
- The API version is placed in the query string as `api-version`.

### 4. Azure request creation

The client sends a `POST` with these headers:

| Header | Value / status |
|---|---|
| `api-key` | Configured key; header is added, value is not logged |
| `content-type` | `application/json` |
| `Authorization` | Not sent; not required for API-key authentication |
| Other Azure-specific headers | None sent |

The JSON body contains `messages`, `max_tokens: 2000`, and `temperature: 0.1`.
No extra subscription header or bearer token is required when using the Azure
OpenAI `api-key` authentication mode. A resource configured for Microsoft Entra
ID would instead use a bearer token; this code is explicitly using key-based
authentication.

## Azure Chat Completions contract comparison

For the classic dated Azure OpenAI API, the deployment-scoped request shape is:

```text
POST https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version={api-version}
```

It uses `Content-Type: application/json` and, for key authentication,
`api-key: {key}`. The implementation matches this shape:

| Requirement | Implementation | Result |
|---|---|---|
| HTTPS Azure resource endpoint | `https://plmaihub013675441957.openai.azure.com` | Matches expected resource-host shape |
| Deployment path | `/openai/deployments/gpt-4o-mini/chat/completions` | Matches |
| Chat Completions operation | `/chat/completions` | Matches |
| API version | `api-version=2025-01-01-preview` query parameter | Correct placement |
| API-key authentication | `api-key` request header | Correct for key auth |
| JSON content type | `content-type: application/json` | Correct |

The dated API version and deployment are syntactically valid in local code, but
the code cannot establish that the selected API version is enabled or the
deployment exists in the specific Azure resource. Such mismatches are not
identified by the captured provider message; this 401 specifically points to
the key or endpoint/resource pairing.

Reference: [Microsoft Learn — Azure OpenAI REST API reference](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference).

## Response handling and 401 classification

The client uses the actual `Response` from `fetch`:

1. If `response.ok` is false, it records `response.status` and sets the internal
   outcome to `provider-http-error`.
2. It retries only statuses `429`, `500`, `502`, `503`, or `504`.
3. It throws `AzureOpenAIError("provider-http-error", ..., response.status)`.
4. `executeCopilotTurn` preserves that error code and numeric provider status in
   the failure outcome.

Therefore the code does not translate an arbitrary provider error into HTTP
401. A non-auth error would retain its own received status (for example 400,
403, or 404). The one-shot diagnostic independently observed `response.status`
as `401`; it also captured the provider body error code `401` and the key/
endpoint message. This is not a classification invented by the application.

The production client does not retain the provider response body in its
user-facing failure. The diagnostic harness read a clone of the response and
captured the sanitized error details without altering the response returned to
the client.

## Likelihood ranking

Most likely first, based on the captured 401 message and the implementation:

1. **B. Endpoint/key mismatch** — the provider explicitly says the key may be
   for a different endpoint/resource. The URL host is syntactically plausible,
   but the endpoint and key have not been independently matched in Azure.
2. **A. Invalid or revoked key** — also explicitly named by Azure; the local
   configuration only proves a non-empty value was sent.
3. **G. Environment-loading/effective-config difference** — possible because
   `process.env` overrides `.env` values and each server/test process has its
   own environment. Historical successful requests did not record endpoint or
   credential fingerprints.
4. **C. Wrong deployment** — the request includes `gpt-4o-mini`; deployment
   existence in this resource was not verified. It is not the cause named in
   the captured 401 body.
5. **E. Wrong API version** — the version is in the expected query parameter;
   API-version incompatibility was not identified in the response.
6. **D. Wrong URL construction** — the URL matches the standard Azure
   deployment-scoped route, including the path and query parameter.
7. **F. Request-header bug** — the required API-key header was present and
   named correctly; JSON content type was also present.

Items 1 and 2 cannot be conclusively ordered from the current provider message:
Azure reported them as alternatives. The ranking reflects that the endpoint
format itself is valid while the key-to-resource association remains unknown.

## Why earlier HTTP 200 records coexist with the current 401

The local usage ledger contains prior HTTP 200 results using deployment
`gpt-4o-mini` and API version `2025-01-01-preview`. It does not record endpoint
hosts or credential fingerprints, so those rows do not prove the successful
requests used the same effective endpoint/key pair as the failed request.
The inspected `frontend/.env` file's last-write time predates those successful
records, but that does not rule out process-level overrides or a different
Next.js server environment.

Yes, separate processes can use different effective environment variables:

- `getCopilotConfig()` reads `process.env` at request time.
- The fixture command explicitly loads `frontend/.env` with Node's
  `--env-file=.env`.
- Node does not overwrite environment variables that are already set when
  loading an env file; inherited values take precedence.
- A Next.js server process has its own environment, established at process
  startup and by Next.js environment-file precedence. Updating `.env` does not
  update an already-running process's inherited environment.
- There is no `.env.local` in the inspected frontend workspace, but a separate
  process-level override remains possible.

Thus environment divergence is possible. It is not proven for the historical
HTTP 200 requests because the ledger lacks endpoint and key identity data. The
historical rows and the current error should not be treated as evidence that the
request builder changes between paths: both live Copilot and fixture validation
call the same `executeCopilotTurn` and `completeCopilotTurn` implementation.

## Root-cause decision

There is no code-level evidence of a URL-format, API-version-placement,
deployment-path, or API-key-header defect. The strongest evidence is a provider
authorization rejection for the configured credential/resource pair. Before
changing Azure settings, compare the effective endpoint and key source used by
the currently running Next.js server with those loaded by the fixture process,
then verify the key belongs to that resource. This is configuration
verification, not a request-construction fix.

The one-shot diagnostic and detailed path comparison are recorded in
[`provider-auth-trace.md`](./provider-auth-trace.md) and
[`provider-path-comparison.md`](./provider-path-comparison.md).

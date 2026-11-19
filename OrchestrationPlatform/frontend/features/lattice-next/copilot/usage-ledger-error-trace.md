# Usage Ledger Error Trace

## Summary

The browser's `usage-ledger-error` is created by the Azure client when
`recordCopilotUsage()` rejects while trying to persist a usage row. This is a
post-request failure, not a prompt interpretation failure. The row is written
for every provider response, including HTTP errors, before the client throws a
provider-status error or returns a successful response.

The ledger failure is converted into a new `AzureOpenAIError` with code
`usage-ledger-error`. The caught filesystem/persistence exception is discarded,
and any provider HTTP status from that attempt is not copied onto the new error.
`executeCopilotTurn` consequently returns `failureCode: "usage-ledger-error"`
without `providerStatus`; the CopilotKit UI displays a safe generic message.

The exact underlying filesystem error cannot be identified from the supplied
browser log: the catch in `logUsage()` does not log or preserve it. This report
makes no provider calls and changes no code.

## Trace: UI → runtime → executor → usage ledger → error

### 1. UI

The supplied browser log reports:

- `runtimeErrorCode: "usage-ledger-error"`
- event code `usage-ledger-error`
- `requestMayHaveBeenBilled: true`
- `retryable: false`

In [`CopilotKitChatSurface.tsx`](../workspace/CopilotKitChatSurface.tsx),
`recordFailure` creates a user-safe UI failure. It retains retry/billing flags
and an optional validation issue; it does not retain the provider HTTP status
or an underlying exception.

### 2. CopilotKit runtime and agent

The live route in
[`route.ts`](../../../app/api/lattice/copilotkit/%5B%5B...path%5D%5D/route.ts)
calls `executeCopilotTurn`. When the result is unsuccessful, it creates a
`CopilotKitAgentError` using `failureCode` and billing/retry metadata.

[`copilotkit-agent.ts`](./copilotkit-agent.ts) emits a `RUN_ERROR` event
containing the error message, code, and metadata. It has no provider-status
field in that event metadata. The user-provided browser output confirms this
event arrived at the UI.

The AG-UI enforcement warnings about removing `threadId` and `runId` from
`RUN_ERROR` are separate shape warnings. They do not create the
`usage-ledger-error`.

### 3. `executeCopilotTurn`

In [`execute-copilot-turn.ts`](./execute-copilot-turn.ts), the executor awaits
`completeCopilotTurn()` inside a `try`/`catch`. The catch reads `code` and
`status` from the thrown object.

For `usage-ledger-error`:

- `failureCode` is recognized.
- `status` is `undefined` on the generated error.
- The outcome is HTTP 502 with `requestMayHaveBeenBilled: true` and
  `retryable: false`.
- `providerStatus` is omitted because no numeric `status` exists on that error.

Thus `executeCopilotTurn` cannot report the original provider status after the
ledger error replaces the provider error.

### 4. Azure client and ledger write ordering

In [`azure-openai-client.ts`](./azure-openai-client.ts),
`completeCopilotTurn()` performs these steps for an HTTP response:

1. `fetch()` returns the provider `Response`.
2. The client reads its JSON body and extracts any usage values.
3. The client calls `logUsage()` with `response.status`, deployment, API
   version, attempt, latency, and available token counts.
4. Only after `logUsage()` succeeds does the client inspect `response.ok` and,
   for a non-2xx response, throw `provider-http-error` with the original status.
5. For a successful response, it parses and returns model content only after
   usage persistence succeeds.

The ledger writer in [`usage-ledger.ts`](./usage-ledger.ts) resolves its target
path as:

```text
resolve(
  LATTICE_COPILOT_USAGE_LOG_PATH
  || join(process.cwd(), ".lattice-data", "copilot-usage.csv")
)
```

It creates the parent directory if necessary, checks whether the file needs a
header, then appends the CSV row. A rejected `mkdir`, `stat` (other than
`ENOENT`), or `appendFile` rejects `recordCopilotUsage()`.

### 5. Error creation and propagation

`logUsage()` catches any rejection from `recordCopilotUsage()` and creates:

```text
AzureOpenAIError(
  code = "usage-ledger-error",
  message = "The model request completed but usage could not be recorded. Do not automatically retry this request."
)
```

This is **not a causal wrapper**:

- It is an `AzureOpenAIError` instance.
- It does not set the original error as `cause`.
- It does not preserve the original error message or filesystem error code.
- It does not preserve a provider `status`.
- The original rejection is swallowed by the bare `catch`.

The error says “model request completed,” but the same `logUsage()` helper is
also used inside the transport-error path. Therefore that message is overly
specific for every possible call site; the invariant is only that usage
recording failed.

## Answers

### 1. Where is `usage-ledger-error` created?

In `logUsage()` in
[`azure-openai-client.ts`](./azure-openai-client.ts), around lines 223–231.
The usage CSV writer itself does not create that error code; it rejects with
the underlying file/persistence error.

### 2. What original error causes it?

Any rejection from `recordCopilotUsage()` causes it. The writer can reject
while creating the directory, checking file metadata, or appending the row.
The supplied browser log does not reveal which operation failed or the OS
error (`EACCES`, `EBUSY`, `ENOSPC`, etc.). No exact filesystem cause can be
claimed from available evidence.

Read-only inspection found the default ledger file at
`frontend/.lattice-data/copilot-usage.csv`; the file was not marked read-only,
and the current user's ACL showed full control. The file's last-write time
predated the provided browser error, and recent rows were not present. These
observations do not establish whether the running Next process used that
working directory/path or what exception its write encountered.

### 3. Does it wrap `AzureOpenAIError`?

It **creates** a new `AzureOpenAIError`; it does not wrap/preserve the caught
error as a cause. If the preceding outcome was itself an Azure provider error,
that earlier error is replaced by this new ledger error.

### 4. Does it preserve the original provider status?

No. The generated `usage-ledger-error` has `status === undefined`. The executor
only includes `providerStatus` when the thrown error has a numeric status.
Consequently, a preceding 401, 429, 500, or 200 response status is absent from
the execution outcome when ledger persistence fails.

### 5. Is the original HTTP 401 still available?

| Location | Available? | Reason |
|---|---|---|
| Current browser/UI log | **No** | It shows the `usage-ledger-error` code/message and billing flags, not provider status. |
| Next.js application log | **Not in the supplied excerpt** | The ledger catch suppresses the write exception and does not log the provider response/status. |
| Usage ledger | **Not for a failed append** | The row containing `response.status` is the write that failed; no row is persisted. Existing older rows cannot identify this request. |
| `executeCopilotTurn` outcome | **No** | The replacement error has no `status`; the outcome has `failureCode` but omits `providerStatus`. |
| Exception metadata | **No** | The replacement error stores `code`, generic `message`, and undefined `status`; no `cause` is attached. |
| Earlier one-shot diagnostic artifact | **Yes, for that separate request only** | [`provider-auth-trace.md`](./provider-auth-trace.md) records the separately captured HTTP 401 and sanitized provider message. It does not prove the outcome of the user's later “hi” request. |

### 6. Why does a simple “hi” request immediately fail?

The prompt text does not control whether usage logging runs. After any upstream
transport result, the Azure client tries to persist the usage row before it
returns an answer or throws the original provider-status error. If that append
fails, the UI receives `usage-ledger-error` and no answer is returned,
regardless of whether the message was “hi” or a longer engineering question.

For the specific “hi” request, the browser event proves ledger persistence
failed somewhere in the request path. It does **not** prove whether the
provider's response was HTTP 200, HTTP 401, or another status, because the
failure code masks that status. The provider may already have processed the
request, which explains the conservative billing warning.

## Evidence from tests and current ledger

[`azure-openai-client.test.ts`](./tests/azure-openai-client.test.ts) includes a
test that makes `recordCopilotUsage` reject with `Error("disk unavailable")`
after a successful mocked provider response and verifies the caller receives
`usage-ledger-error`. This proves that a ledger write failure is sufficient to
produce the same code; it does not prove that `disk unavailable` is the live
failure.

The existing ledger file contains older successful rows, but its last-write
time predates the supplied UI event. There is no persisted row for the reported
request. Thus previous successful ledger writes prove that the writer worked
at an earlier time, not that the current process can write to its effective
path now.

## Code locations

- UI-safe event handling: [`CopilotKitChatSurface.tsx`](../workspace/CopilotKitChatSurface.tsx), `recordFailure`
- Live CopilotKit route: [`route.ts`](../../../app/api/lattice/copilotkit/%5B%5B...path%5D%5D/route.ts)
- `RUN_ERROR` event creation: [`copilotkit-agent.ts`](./copilotkit-agent.ts)
- Provider call and replacement failure outcome: [`execute-copilot-turn.ts`](./execute-copilot-turn.ts)
- Usage persistence ordering and error construction: [`azure-openai-client.ts`](./azure-openai-client.ts), `completeCopilotTurn` / `logUsage`
- CSV path and append operations: [`usage-ledger.ts`](./usage-ledger.ts)
- Simulated disk-write failure proof: [`azure-openai-client.test.ts`](./tests/azure-openai-client.test.ts)

## Findings boundary

The code-level cause of the UI classification is proven: ledger persistence
rejected, and the catch masked the original outcome. The precise underlying
filesystem exception and the provider HTTP status for the “hi” request remain
unknown because neither is logged or retained. This investigation did not
perform a provider request, write a test artifact into the ledger, or change
code.

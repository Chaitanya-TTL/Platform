# Usage Ledger Root-Cause Investigation

## Result

**Current filesystem failure reproduced:** `appendFile` fails while opening the
usage ledger with Windows `EBUSY` (“resource busy or locked”).

**Locking process identified:** Windows Restart Manager identified `EXCEL.EXE`
(PID `85908`) as a process holding the ledger file. Its command line referenced
the CSV path. This is direct evidence of an Excel file lock at the time of the
read-only lock inspection and the no-provider append probe.

The two preceding ledger operations succeeded: recursive `mkdir` and `stat`.
The failing operation is `appendFile` at the OS `open` syscall. The probe wrote
no bytes, added no ledger row, and left the ledger size and last-write time
unchanged.

No code was changed and no provider request was made.

## Runtime ledger path

`recordCopilotUsage()` in [`usage-ledger.ts`](./usage-ledger.ts) chooses its
target as:

```text
path.resolve(
  process.env.LATTICE_COPILOT_USAGE_LOG_PATH?.trim()
  || path.join(process.cwd(), ".lattice-data", "copilot-usage.csv")
)
```

For the inspected frontend process context:

- Working directory: `C:\Users\skk932045\OneDrive - Tata Technologies\Desktop\Platform\OrchestrationPlatform\frontend`
- `LATTICE_COPILOT_USAGE_LOG_PATH`: unset in the diagnostic shell and absent from the inspected `frontend/.env` and `.env.example`
- Resolved default: `C:\Users\skk932045\OneDrive - Tata Technologies\Desktop\Platform\OrchestrationPlatform\frontend\.lattice-data\copilot-usage.csv`

Restart Manager tied the lock to this exact file. The Next.js process command
line points to the same frontend workspace. Its private process environment was
not introspected, so an unobserved process-level override cannot be excluded
absolutely; however, the reported locked file is the expected default target
for this launch context.

## Instrumentation and captured exception

Without changing source code or contacting Azure, a one-off Node diagnostic
executed the ledger's filesystem sequence against the resolved existing file:

| Operation | Result |
|---|---|
| `mkdir(directory, { recursive: true })` | Success |
| `stat(file)` | Success |
| `appendFile(file, "", "utf8")` | Failed before writing any bytes |

Captured error:

```text
name: Error
code: EBUSY
syscall: open
path: C:\Users\skk932045\OneDrive - Tata Technologies\Desktop\Platform\OrchestrationPlatform\frontend\.lattice-data\copilot-usage.csv
message: EBUSY: resource busy or locked, open '<ledger path>'
```

The empty append opened the file using the same append operation but contained
no row data. A before/after check showed that the ledger remained 5,275 bytes
with its prior last-write time. Windows Restart Manager then reported:

```text
PID 85908 — EXCEL.EXE
```

with its command line referencing the ledger CSV.

## Exact operation and cause assessment

| Candidate | Finding |
|---|---|
| `mkdir` | **Ruled out in the probe:** it succeeded. |
| `stat` | **Ruled out in the probe:** it succeeded. |
| `appendFile` | **Confirmed failing operation:** its `open` syscall returned `EBUSY`. |
| Path resolution | **Not the failure in the probe:** the expected file path resolved and was the file locked by Excel. |
| Permission/ACL | **Not supported as the cause:** the diagnostic user has Full Control on the directory and file; the OS returned a busy/locked error, not access denied. |
| Lock | **Confirmed:** `EBUSY` plus Restart Manager identified `EXCEL.EXE` as a holder of the ledger file. |
| Antivirus | No evidence found or needed to explain the reproduced lock. |
| OneDrive sync | The path is under OneDrive, but the identified holder was `EXCEL.EXE`; no evidence identifies the OneDrive sync client as the blocker. |
| Concurrent appends | The ledger code serializes writes within one Node module instance with `pendingWrite`; the observed external holder is Excel. A cross-process race is not needed to explain the failure. |

The existing ACL on `.lattice-data` includes a deny entry for `Everyone` on
`DeleteSubdirectoriesAndFiles`, while the current user has Full Control. That
deny is unrelated to appending to an existing CSV; the observed error is
`EBUSY`, not a permission error.

## Why successful historical rows exist

The ledger already contains earlier successful rows. Its observed last-write
time is `2026-11-02T10:10:43.3864790+05:30`, before the browser error described
in the task. The current lock is held by Excel now. The historical entries can
coexist with the current failure because they were written before the file was
opened/locked by Excel, or before the lock was otherwise active. The available
evidence does not establish exactly when Excel acquired the lock relative to
the first failed “hi” request.

## How this produces the UI error

In [`azure-openai-client.ts`](./azure-openai-client.ts), `completeCopilotTurn()`
calls `logUsage()` before it returns a successful response or throws the
provider-status error. `recordCopilotUsage()` rejects when `appendFile` cannot
open the locked CSV. `logUsage()` catches that exception and creates a new
`AzureOpenAIError` with code `usage-ledger-error`, discarding the original
filesystem exception and any already-received provider status.

`executeCopilotTurn()` then returns `failureCode: "usage-ledger-error"` without
`providerStatus`; the CopilotKit route and UI surface that code. This explains
why even a short “hi” can fail immediately: every provider response must pass
through usage persistence before an answer can be returned.

The original browser request's specific filesystem exception and provider
status were not retained, so it cannot be proven post hoc that the earlier
“hi” failed with this exact exception. The no-provider probe reproduced the
same failure mode on the exact expected ledger file, and the active lock holder
was identified.

## Code and evidence locations

- Path resolution and CSV append:
  [`usage-ledger.ts`](./usage-ledger.ts)
- Ledger write sequencing and error replacement:
  [`azure-openai-client.ts`](./azure-openai-client.ts), `completeCopilotTurn` and `logUsage`
- Executor error translation:
  [`execute-copilot-turn.ts`](./execute-copilot-turn.ts)
- Runtime `RUN_ERROR` emission:
  [`copilotkit-agent.ts`](./copilotkit-agent.ts)
- Prior trace of the masking behavior:
  [`usage-ledger-error-trace.md`](./usage-ledger-error-trace.md)

## Operational conclusion

The precise current persistence failure is **an Excel-held file lock causing
`appendFile` → `open` → `EBUSY`**. The report does not close Excel, alter the
CSV, change code, or make provider calls.

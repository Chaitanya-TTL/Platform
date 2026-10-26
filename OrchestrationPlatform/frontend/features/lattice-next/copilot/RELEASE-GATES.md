# Lattice Investigation Copilot: Privacy and Release Gates

## Current deployment boundary

Stage 1 is read-only with respect to Windchill, SAP, Configit, Teamcenter, and Codebeamer. Copilot suggestions are advisory; recommendations require engineer approval and are never executed. Reopening an investigation does not refresh source systems. Only explicit engineer actions can start a refresh or send a copilot request.

The file-backed investigation and conversation stores are process-local and suitable only for a trusted, single-instance internal environment. Do not enable public or shared multi-user Azure-backed access until both of these gates are met:

- Authentication and per-investigation authorization protect investigation listing, snapshot, archive/restore, refresh, thread, and copilot routes.
- Investigation, event, evidence, and conversation stores move to shared durable storage with cross-instance concurrency control, backups, and access controls.

## Azure configuration

Set these server-only values in the local ignored `.env` file or an approved secret manager:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_LIVE_CALLS_ENABLED=true` is additionally required to permit a paid endpoint request; it is disabled when unset or set to any other value.

Never define a `NEXT_PUBLIC_` Azure credential. Do not print or include credentials in logs, telemetry, URLs, source control, investigation records, transcripts, or evaluation fixtures. The API version configured in deployment must be confirmed through the company-approved network path. A prior minimal check appeared to return HTTP 200 for `2025-01-01-preview`, but Zscaler was reported to block the request; treat API-version verification as inconclusive until IT/resource owners confirm it.

Before any paid endpoint request, obtain explicit user approval with the reason and expected usage/cost, and confirm the company network policy allows it. Keep `AZURE_OPENAI_LIVE_CALLS_ENABLED` unset/false by default; do not enable it just to test a blocked connection. Do not add live model calls to normal tests, builds, cue handling, opening/resuming an investigation, or background jobs. Use synthetic data only in an approved live smoke test.

## Usage ledger and privacy

Provider attempts append an Excel-readable CSV to `.lattice-data/copilot-usage.csv`, which is Git-ignored. It records UTC time, request ID, deployment/API version, attempt, status, latency, provider-reported token counts when available, and optional estimated cost. It must not contain prompts, model responses, raw provider payloads, headers, or keys. The file-backed logger is local and single-instance; production must use an approved shared accounting store if every instance's usage must be consolidated.

Optional estimated cost requires both company-approved rate settings:

- `AZURE_OPENAI_INPUT_COST_PER_1M_USD`
- `AZURE_OPENAI_OUTPUT_COST_PER_1M_USD`

Leave them blank until Finance/IT provides approved rates; token counts remain recorded and cost remains blank. Protect and retain the ledger according to company policy.

## Evaluation and release checks

The synthetic offline evaluation suite is `features/lattice-next/copilot/evals/copilot-evaluation.test.ts` and runs with:

```powershell
npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts
```

It covers native identifiers, source relationships, refreshed values, partial/stale/conflicting evidence, unsupported identifiers, investigation isolation, injection-like evidence, and oversized contexts. Its metric utility reports citation precision, unsupported factual-claim rate, correct uncertainty, isolation, latency budget, token budget, and optional rate-based cost budget.

Before release, require:

- All focused Copilot, investigation, and API tests pass; full typecheck/build/security scan results are reviewed.
- No key-shaped literal or `NEXT_PUBLIC_` Azure setting is present in source or client assets; scan build output if generated.
- The usage ledger excludes prompts, responses, credentials, and raw request/response headers.
- Authentication/authorization and shared storage gates are satisfied before any shared/public deployment.
- API version and network access are confirmed by Azure/resource owners over the approved corporate path.
- A live gpt-4o-mini baseline remains skipped unless the user approves the specific paid request. The live request's token usage and estimated cost should be reviewed from the ledger afterward.

## Current status

Offline synthetic coverage and mocked request/ledger tests are implemented. The live evaluation baseline is not recorded. Shared/public deployment gates are not implemented. The configured API version needs an approved-network confirmation due the reported Zscaler block. These are release blockers, not assumed passes.

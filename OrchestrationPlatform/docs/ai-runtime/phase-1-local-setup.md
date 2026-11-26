# AI Runtime Phase 1: Local setup

This guide covers the .NET AI Runtime's local build, offline tests, and the settings needed to connect a developer instance to platform resources. It does not provision Azure resources or define production authorization policy. A Development-only synthetic identity for local PoC validation is documented below. Do not send client data through the runtime until the approval and deployment prerequisites in [Phase 1 Azure resources](phase-1-azure-resources.md) are met.

## Requirements

- .NET 10 SDK (`net10.0`); run commands from `OrchestrationPlatform`.
- An Entra developer identity with access to the Azure resources you intend to use.
- Platform-provided, non-secret endpoint, deployment, identity, and private PLM service values for any connected run.

Check the installed SDK and restore/build the solution:

```powershell
dotnet --version
dotnet restore .\OrchestrationPlatform.slnx
dotnet build .\OrchestrationPlatform.slnx --no-restore
```

Run the AI Runtime tests and offline evaluation:

```powershell
dotnet test .\Lattice.AI.Runtime.Tests\Lattice.AI.Runtime.Tests.csproj
dotnet run --project .\Lattice.AI.Runtime.Evaluation\Lattice.AI.Runtime.Evaluation.csproj -- --dataset .\evals\engineering-impact\v1
```

The evaluation runner uses checked-in fixtures and a deterministic fake model gateway; it does not call Azure OpenAI. To run the broader solution test suite, use:

```powershell
dotnet test .\OrchestrationPlatform.slnx
```

The evaluation report is a deterministic synthetic-fixture regression report, not a live-model evaluation. It sets `referenceIntegrityEvaluated` to `true`, and `semanticSupportEvaluated` and `liveModelQualityEvaluated` to `false` on every run. Reported intent, subject, clarification, bounded-scope, disposition, evidence/reference/path/chain, parse, and omission rates compare explicit case annotations with runtime observations; each rate includes its numerator and denominator, and has a `null` rate when the denominator is zero. Authorization leakage is the count of annotated denied scenarios that reached evidence retrieval or model invocation. Unsupported-reference rejection records deterministic validator rejection attempts; it does not measure prose truth or engineering correctness. A passing fixture run is not proof that generated prose is semantically supported or useful.

The default test suite uses test doubles for model and signing dependencies and does not require Azure credentials. There is no credentialed/live model integration-test target in this phase; do not add Azure credentials to make the default tests contact a model. Keep any future live-model smoke test explicitly separate, opt-in, and covered by the platform's data-handling approval.

## Entra developer sign-in

In Development, the Azure OpenAI gateway uses `AZURE_OPENAI_API_KEY` from the API process environment when it is set; otherwise it uses `DefaultAzureCredential`. Production always uses `DefaultAzureCredential`. For the local API-key path, the key must be available to the .NET API process; values in the frontend `.env` file are not automatically inherited by the API process.

When using the `DefaultAzureCredential` path, sign in with an approved Entra account using the Azure CLI:

```powershell
az login --tenant <platform-provided-tenant-id>
az account show
```

The selected identity must be granted the necessary resource permissions by the platform. This sign-in supplies credentials to Azure SDK clients; it does **not** by itself authenticate a request to the API or provide an authorization decision. Outside the local Development bridge below, API requests need a bearer token accepted by the configured API issuer and audience, and an available server-side authorization-decision provider.

## Local configuration

Use environment variables or an untracked user-secrets store for local values. Do not commit access tokens, client secrets, API keys, signing material, or production connection strings. Endpoint and deployment names are configuration, not credentials.

The model endpoint and deployment use the same environment-variable names as the frontend:

| Setting | Meaning and validation |
| --- | --- |
| `AZURE_OPENAI_ENDPOINT` | HTTPS Azure OpenAI endpoint. |
| `AZURE_OPENAI_DEPLOYMENT` | Required deployment name at that endpoint. |
| `AZURE_OPENAI_API_KEY` | Development only. Azure OpenAI API key read by the API process; never commit or log it. |
| `AiRuntime__TimeoutSeconds` | Request timeout; default `45`, valid range `1`–`120`. |
| `AiRuntime__MaxOutputTokens` | Maximum output tokens; default `1024`, valid range `1`–`8192`. |
| `AiRuntime__MaxInputTokens` | Development overrides this with `Int32.MaxValue` so estimated input/context budgets do not block PoC execution; effective values are logged. Production still requires a deployment-specific allowance. |

The .NET API does not automatically load `frontend/.env`. From the `OrchestrationPlatform` directory, import only the existing Azure endpoint, deployment, and key into the API process, then start the API. The values are not printed:

```powershell
$envFile = Join-Path (Get-Location) "frontend\.env"
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*(AZURE_OPENAI_ENDPOINT|AZURE_OPENAI_DEPLOYMENT|AZURE_OPENAI_API_KEY)\s*=\s*(.*)\s*$') {
        $name = $matches[1]
        $value = $matches[2].Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}
$env:AiRuntime__TimeoutSeconds = "45"
$env:AiRuntime__MaxOutputTokens = "1024"
$env:AiRuntime__Authentication__Authority = "<platform-provided-entra-authority>"
$env:AiRuntime__Authentication__Audience = "<platform-provided-api-audience>"
dotnet run --project .\Orchestration.API\Orchestration.API.csproj --launch-profile http
```

Development overrides the configured input allowance with an effectively unbounded preflight value, preventing estimated input/context-budget checks from blocking retrieval and model invocation. The model provider can still reject a request that exceeds its actual context window. Production validation is unchanged.

`AiRuntime:Authentication:Authority` and `AiRuntime:Authentication:Audience` configure JWT bearer validation at API ingress. The API validates issuer, audience, signature, and lifetime with no clock skew. The Phase 1 model provider is fixed to Azure OpenAI, and the prompt is the source-controlled `engineering-impact/v1`; neither is selected by configuration.

Outside Development, the input allowance is the configured maximum model input/context window for the selected deployment. The runtime reserves `MaxOutputTokens`, a 15% input safety margin, and an estimate of the fixed prompt/question before allocating an estimated context-token budget. After assembly it estimates the complete system and user message payload and abstains before model invocation if the input plus output reservation and margin do not fit. Both estimates use UTF-8 bytes divided by four; this is a heuristic, not tokenizer output or a guarantee of provider token accounting. The Development fallback bypasses those estimate-based limits; the provider remains responsible for its actual request-size limit.

Telemetry keeps request/trace correlation, stage/outcome data, bounded quality counts, model configuration/version, and token counts. Investigation, canonical entity, tenant, and Context Package identifiers are excluded by default. The `AiRuntime__Telemetry__IncludeInvestigationIdentifier`, `IncludeEntityIdentifier`, `IncludeTenantIdentifier`, and `IncludeContextPackageIdentifier` settings are opt-in and should only be enabled with explicit security approval. Subject IDs, authorization decision IDs, credential headers, URL query values, and raw question/prompt/answer/evidence content remain excluded.

Quality metrics are aggregate only: request outcomes include disposition counts; `lattice.ai.runtime.answer.grounded` counts schema/reference-validated answers; unsupported assertion rejections count distinct rejected claim/code keys; context metrics count omissions and input-budget exhaustion; citation coverage is the ratio of cited evidence IDs with a matching cited source; and source-claim confidence is emitted as a distribution. These metrics have no case, entity, source, claim, or request identifiers. Source-confidence distributions are not by themselves a calibration score, and the deterministic offline evaluation does not evaluate model calibration or semantic answer correctness.

PLM Brain settings are nested under `AiRuntime:PlmBrain` (use double underscores in environment-variable names):

| Environment variable | Purpose |
| --- | --- |
| `AiRuntime__PlmBrain__BaseAddress` | Platform-provided private PLM service base address. |
| `AiRuntime__PlmBrain__WorkloadScope` | Entra scope requested for the API workload token. |
| `AiRuntime__PlmBrain__TenantClaimType` | Tenant claim read from the validated API identity; default `tid`. |
| `AiRuntime__PlmBrain__SubjectClaimType` | Subject claim read from the validated API identity; default `sub`. |
| `AiRuntime__PlmBrain__TicketIssuer` | Issuer placed in the signed authorization decision ticket. |
| `AiRuntime__PlmBrain__TicketAudience` | Audience placed in the signed authorization decision ticket. |
| `AiRuntime__PlmBrain__SigningKeyVaultUri` | Platform-provided Key Vault URI used by the signing adapter. |
| `AiRuntime__PlmBrain__SigningKeyName` | Key Vault key name used to sign decision tickets. |
| `AiRuntime__PlmBrain__MaximumAuthorizationTicketLifetimeSeconds` | Ticket lifetime cap; default `60`, valid range `1`–`60` seconds. |

These are platform configuration values, not substitutes for policy. Outside Development, the API derives identity and authorization server-side; callers must not supply tenant, subject, grants, policy decision, or a signed ticket. `AddAiRuntime` registers `UnavailableResourceAuthorizationDecisionProvider` unless the host supplies a real provider. That default returns no decision, so requests are denied (fail closed); configuring model settings or signing-key settings alone does not enable authorization. Development instead uses the explicitly documented synthetic local identity and does not load Key Vault ticket signing.

`AzureMonitor:Enabled` defaults to `false`. When enabled, configure `AzureMonitor:ConnectionString` or `APPLICATIONINSIGHTS_CONNECTION_STRING`; enabling the exporter without either value causes startup to fail. Do not put an environment-specific connection string in tracked files.

## PLM service environment

The TypeScript PLM service requires the following environment variables for protected internal routes:

| Variable | Requirement |
| --- | --- |
| `LATTICE_PLM_SERVICE_ISSUER` | Expected issuer for the API workload token. |
| `LATTICE_PLM_SERVICE_AUDIENCE` | Expected audience for the API workload token. |
| `LATTICE_PLM_SERVICE_JWKS_URL` | URL from which the service verifies workload-token public keys. |
| `LATTICE_PLM_SERVICE_ROLE` | Required role or scope on the workload token. |
| `LATTICE_DECISION_ISSUER` | Expected issuer of the signed authorization decision ticket. |
| `LATTICE_DECISION_AUDIENCE` | Expected audience of the signed authorization decision ticket. |
| `LATTICE_DECISION_TRUSTED_JWKS` | JSON JWK set containing trusted public decision-signing keys. |
| `LATTICE_DECISION_MAX_LIFETIME_SECONDS` | Optional ticket-lifetime cap; default `60`, valid range `1`–`60`. |
| `LATTICE_DECISION_REVOCATION_CHECK_REQUIRED` | Optional; set to the literal `true` to require a configured revocation checker. |

The service verifies RS256 signatures and issuer/audience, requires the ticket to be unexpired and bound to the active investigation, operation, request, and required grant, and rejects an expired ticket. If revocation checking is required but unavailable—or a configured check cannot determine status—the request is denied. When a checker is configured, it runs and rejects a revoked decision; with no checker, revocation checking is not performed unless the required flag is set, in which case the request is denied.

Authorization tests use a test-only fake signer; they do not generate an ephemeral RSA key, call Key Vault, or produce a cryptographically verifiable ticket. Production signing uses the configured Key Vault key. Do not copy test signing output or use a production private key in local tests. The production signing and public-key distribution boundary is described in the [Azure resource guide](phase-1-azure-resources.md).

## Copilot engineering-impact routing

In `Development`, the runtime endpoint defaults to `http://localhost:5212`, the PLM Brain base address defaults to `http://localhost:3000`, and the frontend Copilot server-side flag `LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED` defaults to enabled. An explicit `true` or `false` overrides that default. The API creates a synthetic local identity for requests without a caller credential; it also accepts the local development token `lattice-local-development`. Protected local PLM routes use that token as both the workload identity and decision ticket. This is a synthetic development identity, not the signed-in developer's identity, and it is not enabled outside `Development`.

This bridge exists only to validate the local Question → Runtime → ContextCompiler → stages → model path. It grants the two runtime operations to local development requests without investigation ownership or per-user authorization. Do not use it with production or client data, expose the local API to a network, or enable this mode outside a local development environment. Production retains JWT bearer authentication, the unavailable authorization-provider default, and signed PLM decision tickets.

In Development, the answer pipeline also uses a permissive parser and bypasses `AnswerValidator`: it extracts a JSON `summary` when available, otherwise returns non-empty model text as the summary. This is intentionally unvalidated PoC output and may contain unsupported claims or missing citations. Production retains the strict answer parser and `AnswerValidator`. Retrieval failures are recorded in execution traces; the runtime continues with other successfully retrieved context and does not add infrastructure error details to the investigation context. Model-provider failures remain explicit failures.

Development API configuration enables full-payload execution traces. To include question, retrieved evidence, compiled context, exact model prompt, model response, and final answer in frontend traces, set `LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE=true` in the frontend server environment while `NODE_ENV=development`. These logs contain investigation content; keep them local and do not use client data. Credential fields and bearer tokens are redacted. A failed retrieval is logged and contributes no result; context compilation and model preparation continue using any other successfully retrieved, authorized context.

The local API readiness endpoint reports `AI_RUNTIME_MODEL_CONFIGURATION_NOT_CONFIGURED` until `AiRuntime` has a valid HTTPS endpoint, deployment, and token budgets. The runtime logs only the active credential provider path (`DevelopmentApiKey` or `DefaultAzureCredential`), never the key. With the flag enabled, questions with an active investigation ID—including broad summaries, evidence, application participation, and exact facts—route to the runtime; other cases retain the existing route.
